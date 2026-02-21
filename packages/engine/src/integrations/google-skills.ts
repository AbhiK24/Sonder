/**
 * Google Skills for Agents
 *
 * High-level skills that agents can invoke to work with Google services.
 * These wrap the low-level Google OAuth APIs into natural language friendly actions.
 */

import { getGoogleOAuth, CalendarEvent, GmailMessage, GoogleTask } from './google-oauth.js';

// =============================================================================
// Types
// =============================================================================

export interface SkillResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;  // Human-readable summary
}

// =============================================================================
// Calendar Skills
// =============================================================================

/**
 * Get upcoming events from the user's calendar
 */
export async function getUpcomingEvents(options: {
  days?: number;
  maxResults?: number;
} = {}): Promise<SkillResult<CalendarEvent[]>> {
  const { days = 7, maxResults = 20 } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + days);

    const events = await google.calendar.listEvents({
      maxResults,
      timeMax,
    });

    const message = events.length === 0
      ? `No events in the next ${days} days.`
      : `Found ${events.length} event(s) in the next ${days} days.`;

    return { success: true, data: events, message };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch events' };
  }
}

/**
 * Get today's events
 */
export async function getTodayEvents(): Promise<SkillResult<CalendarEvent[]>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    // Get start and end of today in IST (user's timezone)
    const timezone = process.env.TIMEZONE || 'Asia/Kolkata';

    // Get current time in IST
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayIST = istFormatter.format(now); // YYYY-MM-DD in IST

    // Create start/end of day in IST, then convert to UTC for API
    const startOfDay = new Date(`${todayIST}T00:00:00+05:30`);
    const endOfDay = new Date(`${todayIST}T23:59:59+05:30`);

    console.log(`[GoogleSkills] Today in IST: ${todayIST}, range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    const events = await google.calendar.listEvents({
      timeMin: startOfDay,  // Start of today
      timeMax: endOfDay,    // End of today
      maxResults: 50,
    });

    console.log(`[GoogleSkills] Found ${events.length} events:`, events.map(e => `${e.start.toISOString()} - ${e.summary}`));

    if (events.length === 0) {
      return { success: true, data: [], message: "You have no events scheduled for today." };
    }

    // Use IST timezone for display (timezone already defined above)
    const summary = events.map(e => {
      const time = e.allDay ? 'All day' : e.start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      });
      return `• ${time}: ${e.summary}`;
    }).join('\n');

    return {
      success: true,
      data: events,
      message: `Today's schedule (${events.length} event${events.length > 1 ? 's' : ''}):\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch events' };
  }
}

/**
 * Create a calendar event with validation and conflict detection
 */
export async function createCalendarEvent(options: {
  title: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  description?: string;
  location?: string;
  invitees?: string[];
}): Promise<SkillResult<CalendarEvent>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    // Check if re-auth is needed
    if (google?.needsReauth()) {
      return { success: false, error: 'Google authentication expired. Please reconnect your Google account.' };
    }
    return { success: false, error: 'Google not connected' };
  }

  const {
    title,
    startTime,
    endTime,
    durationMinutes = 60,
    description,
    location,
    invitees = [],
  } = options;

  const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
  const now = new Date();

  // Validate: reject past times (with 5 min buffer for processing)
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  if (startTime < fiveMinAgo) {
    const requestedTime = startTime.toLocaleString('en-US', { timeZone: timezone });
    const currentTime = now.toLocaleString('en-US', { timeZone: timezone });
    return {
      success: false,
      error: `Cannot create event in the past. You requested ${requestedTime}, but it's currently ${currentTime}. Did you mean a different time?`
    };
  }

  const end = endTime || new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  // Validate: end must be after start
  if (end <= startTime) {
    return { success: false, error: 'Event end time must be after start time.' };
  }

  try {
    // Check for conflicts
    const existingEvents = await google.calendar.listEvents({
      timeMin: new Date(startTime.getTime() - 60000), // 1 min buffer
      timeMax: new Date(end.getTime() + 60000),
      maxResults: 10,
    });

    const conflicts = existingEvents.filter(e => {
      // Check if events overlap
      return e.start < end && e.end > startTime && e.status !== 'cancelled';
    });

    let conflictWarning = '';
    if (conflicts.length > 0) {
      const conflictNames = conflicts.map(c => `"${c.summary}"`).join(', ');
      conflictWarning = `\n⚠️ Note: This overlaps with ${conflictNames}`;
    }

    const event = await google.calendar.createEvent({
      summary: title,
      start: startTime,
      end: end,
      description,
      location,
      attendees: invitees,
      sendNotifications: invitees.length > 0,
    });

    if (!event) {
      return { success: false, error: 'Failed to create event' };
    }

    const timeStr = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
    const dateStr = startTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    });

    const inviteMsg = invitees.length > 0
      ? ` Invitations sent to: ${invitees.join(', ')}.`
      : '';

    const meetMsg = event.meetLink
      ? `\nGoogle Meet: ${event.meetLink}`
      : '';

    return {
      success: true,
      data: event,
      message: `Created "${title}" on ${dateStr} at ${timeStr}.${inviteMsg}${meetMsg}${conflictWarning}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Failed to create event';
    // Check for auth-related errors
    if (errMsg.includes('authentication') || errMsg.includes('reconnect')) {
      return { success: false, error: errMsg };
    }
    return { success: false, error: errMsg };
  }
}

/**
 * Search for calendar events by title/query
 */
export async function searchCalendarEvents(options: {
  query: string;
  days?: number;
}): Promise<SkillResult<CalendarEvent[]>> {
  const { query, days = 30 } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + days);

    const events = await google.calendar.searchEvents({
      query,
      timeMax,
    });

    if (events.length === 0) {
      return { success: true, data: [], message: `No events found matching "${query}".` };
    }

    const summary = events.slice(0, 5).map(e => {
      const date = e.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const time = e.allDay ? 'All day' : e.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `• ${date} ${time}: ${e.summary} (ID: ${e.id})`;
    }).join('\n');

    return {
      success: true,
      data: events,
      message: `Found ${events.length} event(s) matching "${query}":\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
  }
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(options: {
  eventId: string;
  title?: string;
  startTime?: Date;
  endTime?: Date;
  description?: string;
  location?: string;
  addInvitees?: string[];
}): Promise<SkillResult<CalendarEvent>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  const {
    eventId,
    title,
    startTime,
    endTime,
    description,
    location,
    addInvitees,
  } = options;

  try {
    const event = await google.calendar.updateEvent({
      eventId,
      summary: title,
      start: startTime,
      end: endTime,
      description,
      location,
      attendees: addInvitees,
      sendNotifications: (addInvitees?.length || 0) > 0,
    });

    if (!event) {
      return { success: false, error: 'Failed to update event' };
    }

    const changes: string[] = [];
    if (title) changes.push(`title to "${title}"`);
    if (startTime) changes.push(`time to ${startTime.toLocaleString()}`);
    if (location) changes.push(`location to "${location}"`);
    if (addInvitees?.length) changes.push(`added ${addInvitees.join(', ')}`);

    return {
      success: true,
      data: event,
      message: `Updated event "${event.summary}": ${changes.join(', ') || 'no changes'}.`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Update failed' };
  }
}

/**
 * Find free time slots
 */
export async function findFreeTime(options: {
  date?: Date;
  durationMinutes?: number;
  workdayStart?: number;  // hour, default 9
  workdayEnd?: number;    // hour, default 18
} = {}): Promise<SkillResult<{ start: Date; end: Date }[]>> {
  const {
    date = new Date(),
    durationMinutes = 60,
    workdayStart = 9,
    workdayEnd = 18,
  } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const dayStart = new Date(date);
    dayStart.setHours(workdayStart, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(workdayEnd, 0, 0, 0);

    const events = await google.calendar.listEvents({
      timeMin: dayStart,
      timeMax: dayEnd,
      maxResults: 50,
    });

    // Find gaps
    const slots: { start: Date; end: Date }[] = [];
    let currentStart = dayStart;

    for (const event of events) {
      if (event.start > currentStart) {
        const gapMinutes = (event.start.getTime() - currentStart.getTime()) / 60000;
        if (gapMinutes >= durationMinutes) {
          slots.push({ start: new Date(currentStart), end: new Date(event.start) });
        }
      }
      if (event.end > currentStart) {
        currentStart = event.end;
      }
    }

    // Check end of day
    if (dayEnd > currentStart) {
      const gapMinutes = (dayEnd.getTime() - currentStart.getTime()) / 60000;
      if (gapMinutes >= durationMinutes) {
        slots.push({ start: new Date(currentStart), end: dayEnd });
      }
    }

    if (slots.length === 0) {
      return { success: true, data: [], message: `No ${durationMinutes}-minute free slots available on ${date.toLocaleDateString()}.` };
    }

    const summary = slots.map(s =>
      `• ${s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${s.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    ).join('\n');

    return {
      success: true,
      data: slots,
      message: `Free slots on ${date.toLocaleDateString()}:\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to find free time' };
  }
}

// =============================================================================
// Gmail Skills
// =============================================================================

/**
 * Get recent emails
 */
export async function getRecentEmails(options: {
  count?: number;
  unreadOnly?: boolean;
} = {}): Promise<SkillResult<GmailMessage[]>> {
  const { count = 10, unreadOnly = false } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const query = unreadOnly ? 'is:unread' : undefined;
    const messages = await google.gmail.listMessages({ maxResults: count, query });

    if (messages.length === 0) {
      return { success: true, data: [], message: unreadOnly ? "No unread emails." : "No recent emails." };
    }

    const summary = messages.slice(0, 5).map(m => {
      const from = m.from.split('<')[0].trim() || m.from;
      const date = m.date.toLocaleDateString();
      return `• ${from}: "${m.subject}" (${date})`;
    }).join('\n');

    const moreMsg = messages.length > 5 ? `\n...and ${messages.length - 5} more.` : '';

    return {
      success: true,
      data: messages,
      message: `${unreadOnly ? 'Unread' : 'Recent'} emails:\n${summary}${moreMsg}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch emails' };
  }
}

/**
 * Search emails
 */
export async function searchEmails(query: string, maxResults = 10): Promise<SkillResult<GmailMessage[]>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const messages = await google.gmail.listMessages({ query, maxResults });

    if (messages.length === 0) {
      return { success: true, data: [], message: `No emails found for "${query}".` };
    }

    const summary = messages.slice(0, 5).map(m => {
      const from = m.from.split('<')[0].trim() || m.from;
      return `• ${from}: "${m.subject}"`;
    }).join('\n');

    return {
      success: true,
      data: messages,
      message: `Found ${messages.length} email(s) for "${query}":\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to search emails' };
  }
}

/**
 * Read a specific email (full content)
 */
export async function readEmail(messageId: string): Promise<SkillResult<GmailMessage>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const message = await google.gmail.getFullMessage(messageId);

    if (!message) {
      return { success: false, error: 'Email not found' };
    }

    return {
      success: true,
      data: message,
      message: `From: ${message.from}\nSubject: ${message.subject}\nDate: ${message.date.toLocaleString()}\n\n${message.body?.slice(0, 1000) || message.snippet}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to read email' };
  }
}

/**
 * Get unread email count
 */
export async function getUnreadCount(): Promise<SkillResult<number>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const count = await google.gmail.getUnreadCount();
    return {
      success: true,
      data: count,
      message: count === 0 ? "Inbox zero! No unread emails." : `You have ${count} unread email${count > 1 ? 's' : ''}.`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get unread count' };
  }
}

/**
 * Summarize recent emails
 */
export async function summarizeEmails(options: {
  count?: number;
  query?: string;
} = {}): Promise<SkillResult<{ emails: GmailMessage[]; summary: string }>> {
  const { count = 10, query } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const messages = await google.gmail.listMessages({ maxResults: count, query });

    if (messages.length === 0) {
      return { success: true, data: { emails: [], summary: 'No emails to summarize.' }, message: 'No emails found.' };
    }

    // Group by sender
    const bySender: Record<string, GmailMessage[]> = {};
    for (const msg of messages) {
      const sender = msg.from.split('<')[0].trim() || msg.from.split('@')[0];
      if (!bySender[sender]) bySender[sender] = [];
      bySender[sender].push(msg);
    }

    const lines = Object.entries(bySender)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([sender, msgs]) => {
        const subjects = msgs.slice(0, 2).map(m => `"${m.subject}"`).join(', ');
        return `• ${sender} (${msgs.length}): ${subjects}`;
      });

    const summary = `Email summary (${messages.length} emails):\n${lines.join('\n')}`;

    return {
      success: true,
      data: { emails: messages, summary },
      message: summary,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to summarize emails' };
  }
}

/**
 * Find replies/follow-ups to an email using smart fuzzy search
 */
export async function findEmailReplies(options: {
  subject?: string;
  threadId?: string;
  contactEmail?: string;
  keywords?: string[];  // Context words to help find the right thread
  daysBack?: number;    // How far back to search (default 14 days)
}): Promise<SkillResult<GmailMessage[]>> {
  const { subject, threadId, contactEmail, keywords, daysBack } = options;

  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const messages = await google.gmail.findReplies({
      subject,
      threadId,
      to: contactEmail,
      keywords,
      daysBack,
    });

    if (messages.length === 0) {
      return { success: true, data: [], message: 'No replies found.' };
    }

    // Sort by date
    messages.sort((a, b) => a.date.getTime() - b.date.getTime());

    const summary = messages.map((m, i) => {
      const from = m.from.split('<')[0].trim() || m.from;
      const date = m.date.toLocaleDateString();
      const prefix = i === 0 ? 'Original' : `Reply ${i}`;
      return `${prefix} (${date}) - ${from}: "${m.snippet.slice(0, 50)}..."`;
    }).join('\n');

    return {
      success: true,
      data: messages,
      message: `Found ${messages.length} message(s) in thread:\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to find replies' };
  }
}

/**
 * Send an email via Gmail (from user's actual Gmail address)
 */
export async function sendGmailEmail(options: {
  to: string | string[];
  subject: string;
  body: string;
  html?: boolean;
}): Promise<SkillResult<{ messageId: string }>> {
  const { to, subject, body, html = false } = options;

  const google = getGoogleOAuth();
  console.log(`[sendGmailEmail] Google instance: ${!!google}, authenticated: ${google?.isAuthenticated()}`);
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected. Cannot send via Gmail.' };
  }

  try {
    console.log(`[sendGmailEmail] Calling gmail.sendMessage...`);
    const result = await google.gmail.sendMessage({
      to: Array.isArray(to) ? to : [to],
      subject,
      body,
      html,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to send email' };
    }

    const recipients = Array.isArray(to) ? to.join(', ') : to;
    return {
      success: true,
      data: { messageId: result.messageId! },
      message: `Email sent to ${recipients}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

// =============================================================================
// Tasks Skills
// =============================================================================

/**
 * Get pending tasks
 */
export async function getPendingTasks(): Promise<SkillResult<GoogleTask[]>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const tasks = await google.tasks.listTasks('@default', { showCompleted: false });

    if (tasks.length === 0) {
      return { success: true, data: [], message: "No pending tasks. You're all caught up!" };
    }

    const summary = tasks.slice(0, 10).map(t => {
      const due = t.due ? ` (due ${t.due.toLocaleDateString()})` : '';
      return `• ${t.title}${due}`;
    }).join('\n');

    return {
      success: true,
      data: tasks,
      message: `Pending tasks (${tasks.length}):\n${summary}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch tasks' };
  }
}

/**
 * Create a new task
 */
export async function createTask(options: {
  title: string;
  notes?: string;
  dueDate?: Date;
}): Promise<SkillResult<GoogleTask>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const task = await google.tasks.createTask('@default', {
      title: options.title,
      notes: options.notes,
      due: options.dueDate,
    });

    if (!task) {
      return { success: false, error: 'Failed to create task' };
    }

    const dueMsg = options.dueDate ? ` (due ${options.dueDate.toLocaleDateString()})` : '';
    return {
      success: true,
      data: task,
      message: `Created task: "${options.title}"${dueMsg}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create task' };
  }
}

/**
 * Complete a task
 */
export async function completeTask(taskId: string): Promise<SkillResult<void>> {
  const google = getGoogleOAuth();
  if (!google?.isAuthenticated()) {
    return { success: false, error: 'Google not connected' };
  }

  try {
    const success = await google.tasks.completeTask('@default', taskId);

    if (!success) {
      return { success: false, error: 'Failed to complete task' };
    }

    return { success: true, message: 'Task marked as complete!' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to complete task' };
  }
}

// =============================================================================
// Export all skills
// =============================================================================

export const GoogleSkills = {
  // Calendar
  getUpcomingEvents,
  getTodayEvents,
  createCalendarEvent,
  updateCalendarEvent,
  searchCalendarEvents,
  findFreeTime,

  // Gmail
  getRecentEmails,
  searchEmails,
  readEmail,
  getUnreadCount,
  summarizeEmails,
  findEmailReplies,
  sendGmailEmail,

  // Tasks
  getPendingTasks,
  createTask,
  completeTask,
};

export default GoogleSkills;
