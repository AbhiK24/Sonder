/**
 * Email Integrations
 *
 * Two adapters:
 * - Gmail: Full inbox access (OAuth - complex setup)
 * - Resend: Send-only (API key - dead simple)
 *
 * For agent outbound emails, use Resend. It's just an API key.
 * For reading user's inbox, use Gmail (if they want that feature).
 */

import {
  EmailAdapter,
  SimpleEmailAdapter,
  EmailMessage,
  EmailSummary,
  EmailFilter,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus
} from './types.js';

// =============================================================================
// Gmail Adapter
// =============================================================================

export class GmailAdapter implements EmailAdapter {
  type = 'gmail' as const;
  status: IntegrationStatus = 'disconnected';

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private userEmail: string | null = null;

  private static readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private static readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private static readonly API_BASE = 'https://gmail.googleapis.com/gmail/v1';

  // Scopes - read-only by default, compose for drafts, send for sending
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
  ];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    try {
      this.status = 'connecting';

      if (credentials.accessToken) {
        this.accessToken = credentials.accessToken;
        this.refreshToken = credentials.refreshToken || null;

        // Verify and get user email
        const check = await this.healthCheck();
        if (!check.success) {
          this.status = 'error';
          return check;
        }

        this.status = 'connected';
        return { success: true };
      }

      this.status = 'error';
      return {
        success: false,
        error: 'No access token provided. Use getAuthUrl() to start OAuth flow.'
      };
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.userEmail = null;
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.accessToken !== null;
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    if (!this.accessToken) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(
        `${GmailAdapter.API_BASE}/users/me/profile`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (response.status === 401) {
        return { success: false, error: 'Token expired' };
      }

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const profile = await response.json();
      this.userEmail = profile.emailAddress;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // OAuth Helpers
  // ---------------------------------------------------------------------------

  static getAuthUrl(clientId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GmailAdapter.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${GmailAdapter.AUTH_URL}?${params.toString()}`;
  }

  static async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<IntegrationResult<IntegrationCredentials>> {
    try {
      const response = await fetch(GmailAdapter.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Token exchange failed: ${error}` };
      }

      const data = await response.json();

      return {
        success: true,
        data: {
          type: 'gmail',
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  async getMessages(filter: EmailFilter): Promise<IntegrationResult<EmailSummary[]>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Build query
      const queryParts: string[] = [];

      if (filter.query) queryParts.push(filter.query);
      if (filter.unreadOnly) queryParts.push('is:unread');
      if (filter.after) queryParts.push(`after:${Math.floor(filter.after.getTime() / 1000)}`);

      const params = new URLSearchParams({
        maxResults: String(filter.maxResults || 20),
      });

      if (queryParts.length > 0) {
        params.set('q', queryParts.join(' '));
      }

      if (filter.labelIds?.length) {
        filter.labelIds.forEach(id => params.append('labelIds', id));
      }

      // Get message list
      const listResponse = await fetch(
        `${GmailAdapter.API_BASE}/users/me/messages?${params}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (!listResponse.ok) {
        return { success: false, error: `API error: ${listResponse.status}` };
      }

      const listData = await listResponse.json();
      const messages = listData.messages || [];

      // Get details for each message (in parallel, limited batch)
      const summaries: EmailSummary[] = [];

      for (const msg of messages.slice(0, filter.maxResults || 20)) {
        const detailResponse = await fetch(
          `${GmailAdapter.API_BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          }
        );

        if (detailResponse.ok) {
          const detail = await detailResponse.json();
          summaries.push(this.parseMessageSummary(detail));
        }
      }

      return { success: true, data: summaries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch messages'
      };
    }
  }

  async getMessage(messageId: string): Promise<IntegrationResult<EmailMessage>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(
        `${GmailAdapter.API_BASE}/users/me/messages/${messageId}?format=full`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const message = this.parseFullMessage(data);

      return { success: true, data: message };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch message'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Create Operations (Safe)
  // ---------------------------------------------------------------------------

  async createDraft(email: EmailMessage): Promise<IntegrationResult<{ draftId: string }>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const raw = this.createRawEmail(email);

      const response = await fetch(
        `${GmailAdapter.API_BASE}/users/me/drafts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { raw }
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to create draft: ${error}` };
      }

      const draft = await response.json();
      return { success: true, data: { draftId: draft.id } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create draft'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Send Operations (Requires Confirmation)
  // ---------------------------------------------------------------------------

  async sendEmail(
    email: EmailMessage,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    if (!confirmed) {
      return {
        success: false,
        error: 'Email send requires confirmation. Set confirmed=true after user confirms.'
      };
    }

    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const raw = this.createRawEmail(email);

      const response = await fetch(
        `${GmailAdapter.API_BASE}/users/me/messages/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to send email: ${error}` };
      }

      const sent = await response.json();
      return { success: true, data: { messageId: sent.id } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      };
    }
  }

  async sendDraft(
    draftId: string,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    if (!confirmed) {
      return {
        success: false,
        error: 'Draft send requires confirmation. Set confirmed=true after user confirms.'
      };
    }

    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(
        `${GmailAdapter.API_BASE}/users/me/drafts/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: draftId }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to send draft: ${error}` };
      }

      const sent = await response.json();
      return { success: true, data: { messageId: sent.id } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send draft'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseMessageSummary(data: any): EmailSummary {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    return {
      id: data.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      snippet: data.snippet || '',
      receivedAt: new Date(parseInt(data.internalDate)),
      isUnread: data.labelIds?.includes('UNREAD') || false,
      labels: data.labelIds,
    };
  }

  private parseFullMessage(data: any): EmailMessage {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Extract body (simplified - real implementation needs to handle multipart)
    let body = '';
    if (data.payload?.body?.data) {
      body = Buffer.from(data.payload.body.data, 'base64').toString('utf8');
    } else if (data.payload?.parts) {
      const textPart = data.payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
      }
    }

    return {
      id: data.id,
      from: getHeader('From'),
      to: getHeader('To').split(',').map((e: string) => e.trim()),
      cc: getHeader('Cc') ? getHeader('Cc').split(',').map((e: string) => e.trim()) : undefined,
      subject: getHeader('Subject'),
      body,
      threadId: data.threadId,
      receivedAt: new Date(parseInt(data.internalDate)),
    };
  }

  private createRawEmail(email: EmailMessage): string {
    const lines = [
      `To: ${email.to.join(', ')}`,
      `Subject: ${email.subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      '',
      email.body,
    ];

    if (email.cc?.length) {
      lines.splice(1, 0, `Cc: ${email.cc.join(', ')}`);
    }

    const raw = lines.join('\r\n');
    return Buffer.from(raw).toString('base64url');
  }
}

// =============================================================================
// Resend Adapter (Simple - just API key)
// =============================================================================

/**
 * Resend adapter for agent outbound emails.
 *
 * Setup:
 * 1. Sign up at resend.com
 * 2. Add your domain (or use their test domain)
 * 3. Get API key
 * 4. Done. That's it. No OAuth, no consent screens.
 */
export class ResendAdapter implements SimpleEmailAdapter {
  type = 'resend' as const;
  status: IntegrationStatus = 'disconnected';

  private apiKey: string | null = null;
  private fromAddress: string | null = null;

  private static readonly API_BASE = 'https://api.resend.com';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    try {
      this.status = 'connecting';

      if (!credentials.apiKey) {
        this.status = 'error';
        return {
          success: false,
          error: 'No API key provided. Get one from resend.com/api-keys'
        };
      }

      this.apiKey = credentials.apiKey;
      this.fromAddress = credentials.metadata?.fromAddress as string || null;

      // Verify API key works
      const check = await this.healthCheck();
      if (!check.success) {
        this.status = 'error';
        return check;
      }

      this.status = 'connected';
      return { success: true };
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async disconnect(): Promise<void> {
    this.apiKey = null;
    this.fromAddress = null;
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.apiKey !== null;
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    if (!this.apiKey) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Resend doesn't have a dedicated health endpoint, but we can list domains
      const response = await fetch(`${ResendAdapter.API_BASE}/domains`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  async sendEmail(
    email: EmailMessage,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    if (!confirmed) {
      return {
        success: false,
        error: 'Email send requires confirmation. Set confirmed=true after user confirms.'
      };
    }

    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const from = email.from || this.fromAddress;
      if (!from) {
        return {
          success: false,
          error: 'No "from" address. Set in email or credentials.metadata.fromAddress'
        };
      }

      const payload: Record<string, unknown> = {
        from,
        to: email.to,
        subject: email.subject,
      };

      // Prefer HTML if available, fall back to text
      if (email.bodyHtml) {
        payload.html = email.bodyHtml;
      } else {
        payload.text = email.body;
      }

      if (email.cc?.length) {
        payload.cc = email.cc;
      }

      const response = await fetch(`${ResendAdapter.API_BASE}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return {
          success: false,
          error: `Failed to send: ${error.message || response.status}`
        };
      }

      const result = await response.json();
      return { success: true, data: { messageId: result.id } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      };
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createEmailAdapter(type: 'gmail'): EmailAdapter;
export function createEmailAdapter(type: 'resend'): SimpleEmailAdapter;
export function createEmailAdapter(type: 'gmail' | 'resend'): EmailAdapter | SimpleEmailAdapter {
  switch (type) {
    case 'gmail':
      return new GmailAdapter();
    case 'resend':
      return new ResendAdapter();
    default:
      throw new Error(`Unknown email adapter type: ${type}`);
  }
}
