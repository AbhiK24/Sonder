/**
 * Google Calendar Integration
 *
 * Read events, create events, know the user's schedule.
 * Safety: Can create and update, never delete.
 */

import {
  CalendarAdapter,
  CalendarEvent,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus,
  ICSFeedConfig
} from './types.js';
import ical from 'node-ical';
import rrule from 'rrule';
const { RRule, RRuleSet } = rrule;

// =============================================================================
// Google Calendar Adapter
// =============================================================================

export class GoogleCalendarAdapter implements CalendarAdapter {
  type = 'google_calendar' as const;
  status: IntegrationStatus = 'disconnected';

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private calendarId: string = 'primary';

  // OAuth URLs
  private static readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private static readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private static readonly API_BASE = 'https://www.googleapis.com/calendar/v3';

  // Scopes needed
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
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

        // Verify token works
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
        `${GoogleCalendarAdapter.API_BASE}/calendars/${this.calendarId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (response.status === 401) {
        // Token expired, try refresh
        if (this.refreshToken) {
          const refreshed = await this.refreshAccessToken();
          if (!refreshed.success) return refreshed;
          return this.healthCheck();
        }
        return { success: false, error: 'Token expired' };
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
  // OAuth Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the URL to start OAuth flow
   */
  static getAuthUrl(clientId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GoogleCalendarAdapter.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${GoogleCalendarAdapter.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange auth code for tokens
   */
  static async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<IntegrationResult<IntegrationCredentials>> {
    try {
      const response = await fetch(GoogleCalendarAdapter.TOKEN_URL, {
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

      const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };

      return {
        success: true,
        data: {
          type: 'google_calendar',
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

  private async refreshAccessToken(): Promise<IntegrationResult<void>> {
    // Would need clientId/clientSecret stored to refresh
    // For now, return error
    return { success: false, error: 'Token refresh not implemented - reconnect required' };
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  async getEvents(startDate: Date, endDate: Date): Promise<IntegrationResult<CalendarEvent[]>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const params = new URLSearchParams({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      });

      const response = await fetch(
        `${GoogleCalendarAdapter.API_BASE}/calendars/${this.calendarId}/events?${params}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json() as { items?: any[] };
      const events = this.parseEvents(data.items || []);

      return { success: true, data: events };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch events'
      };
    }
  }

  async getUpcoming(hours: number = 24): Promise<IntegrationResult<CalendarEvent[]>> {
    const now = new Date();
    const endDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.getEvents(now, endDate);
  }

  // ---------------------------------------------------------------------------
  // Create Operations (Safe)
  // ---------------------------------------------------------------------------

  async createEvent(event: CalendarEvent): Promise<IntegrationResult<CalendarEvent>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const googleEvent = this.toGoogleEvent(event);

      const response = await fetch(
        `${GoogleCalendarAdapter.API_BASE}/calendars/${this.calendarId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to create event: ${error}` };
      }

      const created = await response.json();
      const parsed = this.parseEvent(created);

      return { success: true, data: parsed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event'
      };
    }
  }

  async updateEvent(
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<IntegrationResult<CalendarEvent>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // First get the existing event
      const getResponse = await fetch(
        `${GoogleCalendarAdapter.API_BASE}/calendars/${this.calendarId}/events/${eventId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );

      if (!getResponse.ok) {
        return { success: false, error: 'Event not found' };
      }

      const existing = await getResponse.json();
      const merged = { ...this.parseEvent(existing), ...updates };
      const googleEvent = this.toGoogleEvent(merged);

      const response = await fetch(
        `${GoogleCalendarAdapter.API_BASE}/calendars/${this.calendarId}/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to update event: ${error}` };
      }

      const updated = await response.json();
      return { success: true, data: this.parseEvent(updated) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update event'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseEvents(items: any[]): CalendarEvent[] {
    return items.map(item => this.parseEvent(item));
  }

  private parseEvent(item: any): CalendarEvent {
    const isAllDay = !item.start?.dateTime;

    return {
      id: item.id,
      title: item.summary || 'Untitled',
      description: item.description,
      startTime: new Date(item.start?.dateTime || item.start?.date),
      endTime: new Date(item.end?.dateTime || item.end?.date),
      location: item.location,
      attendees: item.attendees?.map((a: any) => a.email),
      isAllDay,
      reminders: item.reminders?.overrides?.map((r: any) => ({
        method: r.method,
        minutesBefore: r.minutes,
      })),
    };
  }

  private toGoogleEvent(event: CalendarEvent): any {
    const googleEvent: any = {
      summary: event.title,
      description: event.description,
      location: event.location,
    };

    if (event.isAllDay) {
      googleEvent.start = { date: event.startTime.toISOString().split('T')[0] };
      googleEvent.end = { date: event.endTime.toISOString().split('T')[0] };
    } else {
      googleEvent.start = { dateTime: event.startTime.toISOString() };
      googleEvent.end = { dateTime: event.endTime.toISOString() };
    }

    if (event.attendees?.length) {
      googleEvent.attendees = event.attendees.map(email => ({ email }));
    }

    if (event.reminders?.length) {
      googleEvent.reminders = {
        useDefault: false,
        overrides: event.reminders.map(r => ({
          method: r.method,
          minutes: r.minutesBefore,
        })),
      };
    }

    return googleEvent;
  }
}

// =============================================================================
// ICS Feed Adapter (Read-Only, Multiple Calendars)
// =============================================================================

interface CachedFeed {
  events: CalendarEvent[];
  rawEvents: RawICSEvent[];  // Store raw events for RRULE expansion
  fetchedAt: Date;
}

interface RawAttendee {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needs-action' | 'unknown';
  role?: 'required' | 'optional' | 'chair';
}

interface RawICSEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  rrule?: string;  // Raw RRULE string
  exdate?: Date[]; // Excluded dates
  feedId: string;
  feedName: string;
  // Rich metadata
  organizer?: { email: string; name?: string };
  attendees?: RawAttendee[];
  conferenceUrl?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export class ICSFeedAdapter implements CalendarAdapter {
  type = 'ics_feed' as const;
  status: IntegrationStatus = 'disconnected';

  private feeds: Map<string, ICSFeedConfig> = new Map();
  private cache: Map<string, CachedFeed> = new Map();
  private defaultRefreshMinutes = 15;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    try {
      this.status = 'connecting';

      // Credentials metadata contains feed configs
      const feedConfigs = credentials.metadata?.feeds as ICSFeedConfig[] | undefined;

      if (!feedConfigs || feedConfigs.length === 0) {
        this.status = 'error';
        return { success: false, error: 'No ICS feeds configured' };
      }

      // Store feeds
      for (const feed of feedConfigs) {
        this.feeds.set(feed.id, feed);
      }

      // Verify at least one feed works
      const check = await this.healthCheck();
      if (!check.success) {
        this.status = 'error';
        return check;
      }

      this.status = 'connected';
      console.log(`[ICS] Connected with ${this.feeds.size} calendar(s)`);
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
    this.feeds.clear();
    this.cache.clear();
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.feeds.size > 0;
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    if (this.feeds.size === 0) {
      return { success: false, error: 'No feeds configured' };
    }

    // Try to fetch the first feed
    const firstFeed = this.feeds.values().next().value;
    if (!firstFeed) {
      return { success: false, error: 'No feeds available' };
    }

    try {
      await this.fetchFeed(firstFeed);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch feed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Feed Management
  // ---------------------------------------------------------------------------

  /**
   * Add a new ICS feed
   */
  addFeed(config: ICSFeedConfig): void {
    this.feeds.set(config.id, config);
    this.cache.delete(config.id); // Clear any stale cache
  }

  /**
   * Remove a feed
   */
  removeFeed(feedId: string): void {
    this.feeds.delete(feedId);
    this.cache.delete(feedId);
  }

  /**
   * Get all configured feeds
   */
  getFeeds(): ICSFeedConfig[] {
    return Array.from(this.feeds.values());
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  async getEvents(startDate: Date, endDate: Date): Promise<IntegrationResult<CalendarEvent[]>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const allEvents: CalendarEvent[] = [];

      // Fetch from all feeds
      for (const feed of this.feeds.values()) {
        const events = await this.getEventsFromFeed(feed, startDate, endDate);
        allEvents.push(...events);
      }

      // Sort by start time
      allEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      return { success: true, data: allEvents };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch events'
      };
    }
  }

  async getUpcoming(hours: number = 24): Promise<IntegrationResult<CalendarEvent[]>> {
    const now = new Date();
    const endDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.getEvents(now, endDate);
  }

  // ---------------------------------------------------------------------------
  // Internal: Fetch & Parse
  // ---------------------------------------------------------------------------

  private async getEventsFromFeed(
    feed: ICSFeedConfig,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    // Check cache
    const cached = this.cache.get(feed.id);
    const refreshMs = (feed.refreshMinutes || this.defaultRefreshMinutes) * 60 * 1000;

    let rawEvents: RawICSEvent[];

    if (cached && Date.now() - cached.fetchedAt.getTime() < refreshMs) {
      rawEvents = cached.rawEvents;
    } else {
      const fetched = await this.fetchFeed(feed);
      this.cache.set(feed.id, {
        events: fetched.events,
        rawEvents: fetched.rawEvents,
        fetchedAt: new Date()
      });
      rawEvents = fetched.rawEvents;
    }

    // Expand recurring events and filter by date range
    return this.expandRecurringEvents(rawEvents, startDate, endDate);
  }

  /**
   * Expand recurring events into individual instances within the date range
   */
  private expandRecurringEvents(
    rawEvents: RawICSEvent[],
    startDate: Date,
    endDate: Date
  ): CalendarEvent[] {
    const results: CalendarEvent[] = [];
    const seenKeys = new Set<string>(); // Dedupe by uid + start time

    for (const raw of rawEvents) {
      if (raw.rrule) {
        // Expand recurring event
        try {
          const ruleSet = new RRuleSet();

          // Parse the RRULE - handle multi-line format from node-ical
          let rruleStr = raw.rrule;
          // Extract just the RRULE part if it has DTSTART prefix
          const rruleMatch = rruleStr.match(/RRULE:(.+?)(?:\n|$)/);
          if (rruleMatch) {
            rruleStr = rruleMatch[1];
          } else if (rruleStr.startsWith('RRULE:')) {
            rruleStr = rruleStr.substring(6);
          }

          const rule = RRule.fromString(`DTSTART:${this.formatDateForRRule(raw.startTime)}\n${rruleStr}`);
          ruleSet.rrule(rule);

          // Add exclusion dates
          if (raw.exdate) {
            for (const exd of raw.exdate) {
              ruleSet.exdate(exd);
            }
          }

          // Get occurrences within date range
          const duration = raw.endTime.getTime() - raw.startTime.getTime();
          const occurrences = ruleSet.between(startDate, endDate, true);

          for (const occurrence of occurrences) {
            const key = `${raw.uid}-${occurrence.getTime()}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            const endTime = new Date(occurrence.getTime() + duration);
            const event = this.rawToCalendarEvent(raw, occurrence, endTime);
            event.id = `${raw.uid}-${occurrence.getTime()}`;
            results.push(event);
          }
        } catch (error) {
          console.warn(`[ICS] Failed to expand RRULE for "${raw.summary}":`, error);
          // Fall back to single event
          if (raw.startTime >= startDate && raw.startTime <= endDate) {
            const key = `${raw.uid}-${raw.startTime.getTime()}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push(this.rawToCalendarEvent(raw));
            }
          }
        }
      } else {
        // Single event - filter by date range
        if (raw.startTime >= startDate && raw.startTime <= endDate) {
          const key = `${raw.uid}-${raw.startTime.getTime()}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push(this.rawToCalendarEvent(raw));
          }
        }
      }
    }

    return results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  private formatDateForRRule(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  private rawToCalendarEvent(raw: RawICSEvent, overrideStart?: Date, overrideEnd?: Date): CalendarEvent {
    return {
      id: raw.uid,
      title: raw.summary,
      description: raw.description,
      startTime: overrideStart || raw.startTime,
      endTime: overrideEnd || raw.endTime,
      location: raw.location,
      isAllDay: raw.isAllDay,
      calendarId: raw.feedId,
      calendarName: raw.feedName,
      organizer: raw.organizer,
      attendees: raw.attendees?.map(a => ({
        email: a.email,
        name: a.name,
        status: a.status,
        role: a.role,
      })),
      attendeeEmails: raw.attendees?.map(a => a.email),
      conferenceUrl: raw.conferenceUrl,
      status: raw.status,
      isRecurring: !!raw.rrule,
      recurrenceRule: raw.rrule,
    };
  }

  private async fetchFeed(feed: ICSFeedConfig): Promise<{ events: CalendarEvent[]; rawEvents: RawICSEvent[] }> {
    console.log(`[ICS] Fetching: ${feed.name} (${feed.url.slice(0, 50)}...)`);

    const data = await ical.async.fromURL(feed.url);
    const events: CalendarEvent[] = [];
    const rawEvents: RawICSEvent[] = [];

    for (const key in data) {
      const item = data[key];
      if (!item || item.type !== 'VEVENT') continue;

      const parsed = this.parseICSEventWithRRule(item as ical.VEvent, feed);
      if (parsed) {
        rawEvents.push(parsed.raw);
        events.push(parsed.event);
      }
    }

    console.log(`[ICS] Found ${events.length} events in ${feed.name} (${rawEvents.filter(e => e.rrule).length} recurring)`);

    return { events, rawEvents };
  }

  /**
   * Parse an ICS event and extract RRULE for later expansion
   */
  private parseICSEventWithRRule(
    item: ical.VEvent,
    feed: ICSFeedConfig
  ): { event: CalendarEvent; raw: RawICSEvent } | null {
    try {
      // For recurring event instances, use recurrenceId as the actual date
      let startTime: Date | null = null;
      let endTime: Date | null = null;

      // Check if this is a recurring event instance (has recurrenceId)
      const recurrenceId = (item as any).recurrenceid;
      if (recurrenceId) {
        startTime = new Date(recurrenceId);
        // Calculate end time based on original duration
        const origStart = item.start ? new Date(item.start) : null;
        const origEnd = item.end ? new Date(item.end) : null;
        if (origStart && origEnd) {
          const duration = origEnd.getTime() - origStart.getTime();
          endTime = new Date(startTime.getTime() + duration);
        } else {
          endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
        }
      } else {
        startTime = item.start ? new Date(item.start) : null;
        endTime = item.end ? new Date(item.end) : null;
      }

      if (!startTime || !endTime) return null;

      // Skip events too far in the past (> 1 year) unless they're recurring
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const hasRRule = !!(item as any).rrule;
      if (startTime < oneYearAgo && !hasRRule) return null;

      const isAllDay = item.datetype === 'date';
      const uid = this.getStringValue(item.uid) || `${feed.id}-${startTime.getTime()}`;
      const summary = this.getStringValue(item.summary) || 'Untitled Event';
      const description = this.getStringValue(item.description);
      const location = this.getStringValue(item.location);

      // Extract RRULE
      let rrule: string | undefined;
      const rruleObj = (item as any).rrule;
      if (rruleObj) {
        // node-ical returns rrule as an object with toString()
        if (typeof rruleObj === 'string') {
          rrule = rruleObj;
        } else if (rruleObj.toString) {
          rrule = rruleObj.toString();
        }
      }

      // Extract EXDATE (excluded dates)
      let exdate: Date[] | undefined;
      const exdateRaw = (item as any).exdate;
      if (exdateRaw) {
        exdate = [];
        if (typeof exdateRaw === 'object') {
          for (const key in exdateRaw) {
            const d = exdateRaw[key];
            if (d instanceof Date) {
              exdate.push(d);
            } else if (typeof d === 'string') {
              exdate.push(new Date(d));
            }
          }
        }
      }

      // Extract organizer
      let organizer: { email: string; name?: string } | undefined;
      const organizerRaw = (item as any).organizer;
      if (organizerRaw) {
        const email = this.extractEmail(organizerRaw);
        const name = this.extractName(organizerRaw);
        if (email) {
          organizer = { email, name };
        }
      }

      // Extract attendees
      let attendees: RawAttendee[] | undefined;
      const attendeesRaw = (item as any).attendee;
      if (attendeesRaw) {
        attendees = [];
        const attendeeList = Array.isArray(attendeesRaw) ? attendeesRaw : [attendeesRaw];
        for (const att of attendeeList) {
          const email = this.extractEmail(att);
          if (email) {
            attendees.push({
              email,
              name: this.extractName(att),
              status: this.extractPartStat(att),
              role: this.extractRole(att),
            });
          }
        }
      }

      // Extract conference URL (Zoom, Meet, etc.)
      let conferenceUrl: string | undefined;
      // Check location for URL
      if (location && (location.includes('zoom.us') || location.includes('meet.google.com') || location.includes('teams.microsoft.com'))) {
        conferenceUrl = location;
      }
      // Check description for URL
      if (!conferenceUrl && description) {
        const urlMatch = description.match(/https?:\/\/[^\s<>"]+(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)[^\s<>"]*/i);
        if (urlMatch) {
          conferenceUrl = urlMatch[0];
        }
      }

      // Extract status
      let status: 'confirmed' | 'tentative' | 'cancelled' | undefined;
      const statusRaw = (item as any).status;
      if (statusRaw) {
        const statusStr = String(statusRaw).toLowerCase();
        if (statusStr === 'confirmed') status = 'confirmed';
        else if (statusStr === 'tentative') status = 'tentative';
        else if (statusStr === 'cancelled') status = 'cancelled';
      }

      const raw: RawICSEvent = {
        uid,
        summary,
        description,
        location,
        startTime,
        endTime,
        isAllDay,
        rrule,
        exdate,
        feedId: feed.id,
        feedName: feed.name,
        organizer,
        attendees,
        conferenceUrl,
        status,
      };

      const event: CalendarEvent = {
        id: uid,
        title: summary,
        description,
        startTime,
        endTime,
        location,
        isAllDay,
        calendarId: feed.id,
        calendarName: feed.name,
        organizer,
        attendees: attendees?.map(a => ({
          email: a.email,
          name: a.name,
          status: a.status,
          role: a.role,
        })),
        attendeeEmails: attendees?.map(a => a.email),
        conferenceUrl,
        status,
        isRecurring: !!rrule,
        recurrenceRule: rrule,
      };

      return { event, raw };
    } catch (error) {
      console.warn(`[ICS] Failed to parse event:`, error);
      return null;
    }
  }

  /**
   * Extract string value from ICS field (handles both string and ParameterValue types)
   */
  private getStringValue(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'val' in (value as object)) {
      return (value as { val: string }).val;
    }
    return String(value);
  }

  /**
   * Extract email from ICS organizer/attendee field
   */
  private extractEmail(value: unknown): string | undefined {
    if (!value) return undefined;

    // Handle object with val property (mailto:email)
    if (typeof value === 'object' && 'val' in (value as object)) {
      const val = (value as { val: string }).val;
      if (val.startsWith('mailto:')) {
        return val.substring(7);
      }
      return val;
    }

    // Handle string directly
    if (typeof value === 'string') {
      if (value.startsWith('mailto:')) {
        return value.substring(7);
      }
      return value;
    }

    return undefined;
  }

  /**
   * Extract name (CN) from ICS organizer/attendee field
   */
  private extractName(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const obj = value as { params?: { CN?: string } };
    return obj.params?.CN;
  }

  /**
   * Extract participation status from ICS attendee field
   */
  private extractPartStat(value: unknown): 'accepted' | 'declined' | 'tentative' | 'needs-action' | 'unknown' {
    if (!value || typeof value !== 'object') return 'unknown';

    const obj = value as { params?: { PARTSTAT?: string } };
    const status = obj.params?.PARTSTAT?.toLowerCase();

    switch (status) {
      case 'accepted': return 'accepted';
      case 'declined': return 'declined';
      case 'tentative': return 'tentative';
      case 'needs-action': return 'needs-action';
      default: return 'unknown';
    }
  }

  /**
   * Extract role from ICS attendee field
   */
  private extractRole(value: unknown): 'required' | 'optional' | 'chair' | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const obj = value as { params?: { ROLE?: string } };
    const role = obj.params?.ROLE?.toLowerCase();

    switch (role) {
      case 'req-participant': return 'required';
      case 'opt-participant': return 'optional';
      case 'chair': return 'chair';
      default: return undefined;
    }
  }

}

// =============================================================================
// Factory
// =============================================================================

export function createCalendarAdapter(
  type: 'google_calendar' | 'apple_calendar' | 'ics_feed'
): CalendarAdapter {
  switch (type) {
    case 'google_calendar':
      return new GoogleCalendarAdapter();
    case 'ics_feed':
      return new ICSFeedAdapter();
    case 'apple_calendar':
      throw new Error('Apple Calendar adapter not yet implemented');
    default:
      throw new Error(`Unknown calendar type: ${type}`);
  }
}

/**
 * Create an ICS adapter with feeds pre-configured
 */
export function createICSAdapter(feeds: ICSFeedConfig[]): ICSFeedAdapter {
  const adapter = new ICSFeedAdapter();
  for (const feed of feeds) {
    adapter.addFeed(feed);
  }
  return adapter;
}
