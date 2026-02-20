/**
 * Google OAuth Integration
 *
 * Handles OAuth2 flow for Google services:
 * - Calendar (read/write events)
 * - Gmail (read/send emails)
 * - Tasks (read/write tasks)
 *
 * Usage:
 *   const google = new GoogleOAuth({ clientId, clientSecret, redirectUri });
 *   const authUrl = google.getAuthUrl();
 *   // User visits authUrl, gets redirected back with code
 *   await google.handleCallback(code);
 *   // Now you can use the APIs
 *   const events = await google.calendar.listEvents();
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Directory to store tokens (default: ~/.sonder) */
  tokenDir?: string;
  /** Encryption key for token storage (default: derived from clientSecret) */
  encryptionKey?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  recurring: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: Date;
  labels: string[];
  unread: boolean;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  due?: Date;
  completed: boolean;
  completedAt?: Date;
  listId: string;
}

// =============================================================================
// Constants
// =============================================================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_GMAIL_API = 'https://www.googleapis.com/gmail/v1';
const GOOGLE_TASKS_API = 'https://www.googleapis.com/tasks/v1';

// Scopes for full Google suite
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// =============================================================================
// Token Storage (encrypted)
// =============================================================================

function getEncryptionKey(secret: string): Buffer {
  // Derive a 32-byte key from the secret
  const hash = createHash('sha256');
  hash.update(secret);
  return hash.digest();
}

function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string, key: Buffer): string {
  const [ivHex, encryptedText] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// =============================================================================
// Google OAuth Class
// =============================================================================

export class GoogleOAuth {
  private config: GoogleOAuthConfig;
  private tokens: GoogleTokens | null = null;
  private tokenPath: string;
  private encryptionKey: Buffer;

  // Sub-APIs
  public calendar: GoogleCalendarAPI;
  public gmail: GmailAPI;
  public tasks: GoogleTasksAPI;

  constructor(config: GoogleOAuthConfig) {
    this.config = config;

    const tokenDir = config.tokenDir || resolve(process.env.HOME || '', '.sonder');
    if (!existsSync(tokenDir)) {
      mkdirSync(tokenDir, { recursive: true });
    }
    this.tokenPath = resolve(tokenDir, 'google-tokens.enc');
    this.encryptionKey = getEncryptionKey(config.encryptionKey || config.clientSecret);

    // Load existing tokens
    this.loadTokens();

    // Initialize sub-APIs
    this.calendar = new GoogleCalendarAPI(this);
    this.gmail = new GmailAPI(this);
    this.tasks = new GoogleTasksAPI(this);
  }

  // ---------------------------------------------------------------------------
  // Auth Flow
  // ---------------------------------------------------------------------------

  /**
   * Get the OAuth authorization URL
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent', // Always show consent to get refresh token
    });

    if (state) {
      params.set('state', state);
    }

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback - exchange code for tokens
   */
  async handleCallback(code: string): Promise<{ success: boolean; error?: string; email?: string }> {
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        return { success: false, error: errorData.error_description || 'Token exchange failed' };
      }

      const data = await response.json() as any;

      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        scope: data.scope,
      };

      this.saveTokens();

      // Get user email
      const email = await this.getUserEmail();

      return { success: true, email: email || undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.refreshToken;
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.tokens) return null;

    // Refresh if expired or expiring soon (5 min buffer)
    if (Date.now() > this.tokens.expiresAt - 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }

    return this.tokens?.accessToken || null;
  }

  /**
   * Refresh the access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.tokens.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) return false;

      const data = await response.json() as any;

      this.tokens = {
        ...this.tokens,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      this.saveTokens();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoke access and clear tokens
   */
  async disconnect(): Promise<void> {
    if (this.tokens?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.tokens.accessToken}`, {
          method: 'POST',
        });
      } catch {}
    }

    this.tokens = null;
    if (existsSync(this.tokenPath)) {
      unlinkSync(this.tokenPath);
    }
  }

  /**
   * Get user email from Google
   */
  async getUserEmail(): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json() as any;
        return data.email;
      }
    } catch {}

    return null;
  }

  // ---------------------------------------------------------------------------
  // Token Storage
  // ---------------------------------------------------------------------------

  private loadTokens(): void {
    // Try encrypted file first
    if (existsSync(this.tokenPath)) {
      try {
        const encrypted = readFileSync(this.tokenPath, 'utf-8');
        const decrypted = decrypt(encrypted, this.encryptionKey);
        this.tokens = JSON.parse(decrypted);
        return;
      } catch {
        // Invalid or corrupted tokens
      }
    }

    // Fallback: check for plain JSON (from dashboard)
    const jsonPath = this.tokenPath.replace('.enc', '.json');
    if (existsSync(jsonPath)) {
      try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        // Map dashboard format to our format
        this.tokens = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt || Date.now() + 3600000,
          scope: data.scope || '',
        };
        return;
      } catch {
        // Invalid JSON
      }
    }

    this.tokens = null;
  }

  private saveTokens(): void {
    if (!this.tokens) return;

    try {
      const json = JSON.stringify(this.tokens);
      const encrypted = encrypt(json, this.encryptionKey);
      writeFileSync(this.tokenPath, encrypted, 'utf-8');
    } catch (error) {
      console.error('[GoogleOAuth] Failed to save tokens:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // API Helper
  // ---------------------------------------------------------------------------

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }
}

// =============================================================================
// Google Calendar API
// =============================================================================

class GoogleCalendarAPI {
  constructor(private oauth: GoogleOAuth) {}

  /**
   * List upcoming events
   */
  async listEvents(options: {
    calendarId?: string;
    maxResults?: number;
    timeMin?: Date;
    timeMax?: Date;
  } = {}): Promise<CalendarEvent[]> {
    const {
      calendarId = 'primary',
      maxResults = 50,
      timeMin = new Date(),
      timeMax,
    } = options;

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin.toISOString(),
    });

    if (timeMax) {
      params.set('timeMax', timeMax.toISOString());
    }

    const response = await this.oauth.fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    );

    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json() as any;

    return (data.items || []).map((item: any) => this.parseEvent(item));
  }

  /**
   * Get a single event
   */
  async getEvent(eventId: string, calendarId: string = 'primary'): Promise<CalendarEvent | null> {
    const response = await this.oauth.fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
    );

    if (!response.ok) return null;

    const data = await response.json() as any;
    return this.parseEvent(data);
  }

  /**
   * Create a calendar event (with optional invitees)
   */
  async createEvent(options: {
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    attendees?: string[];  // email addresses
    calendarId?: string;
    sendNotifications?: boolean;
  }): Promise<CalendarEvent | null> {
    const {
      summary,
      description,
      location,
      start,
      end,
      attendees = [],
      calendarId = 'primary',
      sendNotifications = true,
    } = options;

    const event: any = {
      summary,
      start: { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };

    if (description) event.description = description;
    if (location) event.location = location;
    if (attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email }));
    }

    const params = new URLSearchParams();
    if (sendNotifications) params.set('sendUpdates', 'all');

    const response = await this.oauth.fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      console.error('[Calendar] Create event failed:', error);
      return null;
    }

    const data = await response.json() as any;
    return this.parseEvent(data);
  }

  /**
   * Update/edit an existing calendar event
   */
  async updateEvent(options: {
    eventId: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: Date;
    end?: Date;
    attendees?: string[];
    calendarId?: string;
    sendNotifications?: boolean;
  }): Promise<CalendarEvent | null> {
    const {
      eventId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      calendarId = 'primary',
      sendNotifications = true,
    } = options;

    // First get the existing event
    const existing = await this.getEvent(eventId, calendarId);
    if (!existing) {
      console.error('[Calendar] Event not found:', eventId);
      return null;
    }

    // Build update payload (only include changed fields)
    const event: any = {};

    if (summary !== undefined) event.summary = summary;
    if (description !== undefined) event.description = description;
    if (location !== undefined) event.location = location;

    if (start) {
      event.start = { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    if (end) {
      event.end = { dateTime: end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    if (attendees !== undefined) {
      event.attendees = attendees.map(email => ({ email }));
    }

    const params = new URLSearchParams();
    if (sendNotifications) params.set('sendUpdates', 'all');

    const response = await this.oauth.fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?${params}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      console.error('[Calendar] Update event failed:', error);
      return null;
    }

    const data = await response.json() as any;
    return this.parseEvent(data);
  }

  /**
   * Search for events by title/query
   */
  async searchEvents(options: {
    query: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    calendarId?: string;
  }): Promise<CalendarEvent[]> {
    const {
      query,
      timeMin = new Date(),
      timeMax,
      maxResults = 20,
      calendarId = 'primary',
    } = options;

    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin.toISOString(),
    });

    if (timeMax) {
      params.set('timeMax', timeMax.toISOString());
    }

    const response = await this.oauth.fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    );

    if (!response.ok) {
      throw new Error(`Calendar search error: ${response.status}`);
    }

    const data = await response.json() as any;
    return (data.items || []).map((item: any) => this.parseEvent(item));
  }

  /**
   * List all calendars
   */
  async listCalendars(): Promise<Array<{ id: string; name: string; primary: boolean }>> {
    const response = await this.oauth.fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`);

    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json() as any;

    return (data.items || []).map((cal: any) => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
    }));
  }

  private parseEvent(item: any): CalendarEvent {
    const start = item.start?.dateTime
      ? new Date(item.start.dateTime)
      : new Date(item.start?.date);

    const end = item.end?.dateTime
      ? new Date(item.end.dateTime)
      : new Date(item.end?.date);

    return {
      id: item.id,
      summary: item.summary || '(No title)',
      description: item.description,
      location: item.location,
      start,
      end,
      allDay: !item.start?.dateTime,
      recurring: !!item.recurringEventId,
      status: item.status || 'confirmed',
      htmlLink: item.htmlLink,
    };
  }
}

// =============================================================================
// Gmail API
// =============================================================================

class GmailAPI {
  constructor(private oauth: GoogleOAuth) {}

  /**
   * List recent emails
   */
  async listMessages(options: {
    maxResults?: number;
    query?: string;
    labelIds?: string[];
  } = {}): Promise<GmailMessage[]> {
    const { maxResults = 20, query, labelIds } = options;

    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (query) params.set('q', query);
    if (labelIds?.length) params.set('labelIds', labelIds.join(','));

    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/messages?${params}`
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const messages: GmailMessage[] = [];

    // Fetch details for each message
    for (const msg of (data.messages || []).slice(0, maxResults)) {
      const detail = await this.getMessage(msg.id);
      if (detail) messages.push(detail);
    }

    return messages;
  }

  /**
   * Get a single message (metadata only)
   */
  async getMessage(messageId: string): Promise<GmailMessage | null> {
    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
    );

    if (!response.ok) return null;

    const data = await response.json() as any;
    return this.parseMessage(data);
  }

  /**
   * Get full message with body
   */
  async getFullMessage(messageId: string): Promise<GmailMessage | null> {
    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/messages/${messageId}?format=full`
    );

    if (!response.ok) return null;

    const data = await response.json() as any;
    const message = this.parseMessage(data);

    // Extract body
    message.body = this.extractBody(data.payload);

    return message;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/labels/UNREAD`
    );

    if (!response.ok) return 0;

    const data = await response.json() as any;
    return data.messagesUnread || 0;
  }

  /**
   * Extract body from message payload
   */
  private extractBody(payload: any): string {
    if (!payload) return '';

    // Direct body
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart - look for text/plain or text/html
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
      }
      // Fallback to HTML
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          // Strip HTML tags for plain text
          return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        }
      }
      // Recursive for nested parts
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    return '';
  }

  /**
   * Send an email
   */
  async sendMessage(options: {
    to: string | string[];
    subject: string;
    body: string;
    html?: boolean;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, body, html = false } = options;

    const toAddresses = Array.isArray(to) ? to.join(', ') : to;
    const contentType = html ? 'text/html' : 'text/plain';

    const email = [
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(email).toString('base64url');

    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/messages/send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      return { success: false, error: error.error?.message || 'Send failed' };
    }

    const data = await response.json() as any;
    return { success: true, messageId: data.id };
  }

  /**
   * Get all messages in a thread (for finding replies)
   */
  async getThread(threadId: string): Promise<GmailMessage[]> {
    const response = await this.oauth.fetch(
      `${GOOGLE_GMAIL_API}/users/me/threads/${threadId}?format=full`
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const messages = data.messages || [];

    return messages.map((msg: any) => this.parseMessage(msg));
  }

  /**
   * Get recently sent emails (to find threads we started)
   */
  async getSentEmails(options: { maxResults?: number; daysBack?: number } = {}): Promise<GmailMessage[]> {
    const { maxResults = 20, daysBack = 7 } = options;

    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');

    const query = `in:sent after:${afterStr}`;
    return this.listMessages({ query, maxResults });
  }

  /**
   * Find replies to an email - smart search with fuzzy matching
   */
  async findReplies(options: {
    subject?: string;
    threadId?: string;
    to?: string;
    keywords?: string[];  // Multiple keywords to search
    daysBack?: number;
  }): Promise<GmailMessage[]> {
    const { subject, threadId, to, keywords, daysBack = 14 } = options;

    // If we have threadId, get the whole thread directly
    if (threadId) {
      return this.getThread(threadId);
    }

    // Build a smart search query
    const queryParts: string[] = [];

    // Date filter
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
    queryParts.push(`after:${afterStr}`);

    // Subject search - extract key words, not exact match
    if (subject) {
      // Remove Re: Fwd: prefixes and common words
      const cleanSubject = subject
        .replace(/^(Re:|Fwd:|FW:)\s*/gi, '')
        .replace(/\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|also|now|and|but|or|if)\b/gi, '')
        .trim();

      // Split into key words
      const words = cleanSubject.split(/\s+/).filter(w => w.length > 2);

      if (words.length > 0) {
        // Search for any of the key words in subject
        const subjectQuery = words.slice(0, 4).map(w => `subject:${w}`).join(' OR ');
        queryParts.push(`(${subjectQuery})`);
      }
    }

    // Keywords from context
    if (keywords && keywords.length > 0) {
      const kwQuery = keywords.slice(0, 4).map(k => `"${k}"`).join(' OR ');
      queryParts.push(`(${kwQuery})`);
    }

    // Search by contact
    if (to) {
      queryParts.push(`(to:${to} OR from:${to})`);
    }

    // Combine query
    const query = queryParts.join(' ');

    if (query.trim() === `after:${afterStr}`) {
      // No real search criteria, get recent threads
      return this.listMessages({ maxResults: 15 });
    }

    return this.listMessages({ query, maxResults: 20 });
  }

  private parseMessage(data: any): GmailMessage {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

    return {
      id: data.id,
      threadId: data.threadId,
      from: getHeader('From'),
      to: getHeader('To').split(',').map((s: string) => s.trim()),
      subject: getHeader('Subject'),
      snippet: data.snippet || '',
      date: new Date(getHeader('Date') || data.internalDate),
      labels: data.labelIds || [],
      unread: data.labelIds?.includes('UNREAD') || false,
    };
  }
}

// =============================================================================
// Google Tasks API
// =============================================================================

class GoogleTasksAPI {
  constructor(private oauth: GoogleOAuth) {}

  /**
   * List task lists
   */
  async listTaskLists(): Promise<Array<{ id: string; title: string }>> {
    const response = await this.oauth.fetch(`${GOOGLE_TASKS_API}/users/@me/lists`);

    if (!response.ok) {
      throw new Error(`Tasks API error: ${response.status}`);
    }

    const data = await response.json() as any;

    return (data.items || []).map((list: any) => ({
      id: list.id,
      title: list.title,
    }));
  }

  /**
   * List tasks in a list
   */
  async listTasks(listId: string = '@default', options: {
    showCompleted?: boolean;
    maxResults?: number;
  } = {}): Promise<GoogleTask[]> {
    const { showCompleted = false, maxResults = 100 } = options;

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      showCompleted: String(showCompleted),
    });

    const response = await this.oauth.fetch(
      `${GOOGLE_TASKS_API}/lists/${listId}/tasks?${params}`
    );

    if (!response.ok) {
      throw new Error(`Tasks API error: ${response.status}`);
    }

    const data = await response.json() as any;

    return (data.items || []).map((task: any) => this.parseTask(task, listId));
  }

  /**
   * Create a new task
   */
  async createTask(listId: string, task: {
    title: string;
    notes?: string;
    due?: Date;
  }): Promise<GoogleTask | null> {
    const body: any = { title: task.title };
    if (task.notes) body.notes = task.notes;
    if (task.due) body.due = task.due.toISOString();

    const response = await this.oauth.fetch(
      `${GOOGLE_TASKS_API}/lists/${listId}/tasks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as any;
    return this.parseTask(data, listId);
  }

  /**
   * Complete a task
   */
  async completeTask(listId: string, taskId: string): Promise<boolean> {
    const response = await this.oauth.fetch(
      `${GOOGLE_TASKS_API}/lists/${listId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }
    );

    return response.ok;
  }

  private parseTask(task: any, listId: string): GoogleTask {
    return {
      id: task.id,
      title: task.title || '',
      notes: task.notes,
      due: task.due ? new Date(task.due) : undefined,
      completed: task.status === 'completed',
      completedAt: task.completed ? new Date(task.completed) : undefined,
      listId,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

let googleOAuthInstance: GoogleOAuth | null = null;

/**
 * Get or create the Google OAuth instance
 */
export function getGoogleOAuth(config?: GoogleOAuthConfig): GoogleOAuth | null {
  if (googleOAuthInstance) return googleOAuthInstance;

  if (!config) {
    // Try to load from environment
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

    if (!clientId || !clientSecret) {
      return null;
    }

    config = { clientId, clientSecret, redirectUri };
  }

  googleOAuthInstance = new GoogleOAuth(config);
  return googleOAuthInstance;
}

/**
 * Create a new Google OAuth instance (for testing/multiple accounts)
 */
export function createGoogleOAuth(config: GoogleOAuthConfig): GoogleOAuth {
  return new GoogleOAuth(config);
}
