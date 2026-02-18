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
  IntegrationStatus
} from './types.js';

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

      const data = await response.json();

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

      const data = await response.json();
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
// Factory
// =============================================================================

export function createCalendarAdapter(type: 'google_calendar' | 'apple_calendar'): CalendarAdapter {
  switch (type) {
    case 'google_calendar':
      return new GoogleCalendarAdapter();
    case 'apple_calendar':
      throw new Error('Apple Calendar adapter not yet implemented');
    default:
      throw new Error(`Unknown calendar type: ${type}`);
  }
}
