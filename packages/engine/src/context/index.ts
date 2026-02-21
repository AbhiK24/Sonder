/**
 * Engine Context
 *
 * Central store for integration data (calendar, tasks, etc.)
 * Lives at engine level - accessible to all plays.
 * Refreshes periodically to keep data fresh.
 */

import type { CalendarEvent, Task } from '../integrations/types.js';
import type { ICSFeedAdapter } from '../integrations/calendar.js';
import type { TodoistAdapter } from '../integrations/tasks.js';

// =============================================================================
// Types
// =============================================================================

export interface CalendarSnapshot {
  events: CalendarEvent[];
  fetchedAt: Date;
  nextRefresh: Date;
}

export interface TasksSnapshot {
  tasks: Task[];
  fetchedAt: Date;
  nextRefresh: Date;
}

export interface EngineContextData {
  calendar: CalendarSnapshot | null;
  tasks: TasksSnapshot | null;
}

export interface EngineContextConfig {
  calendarAdapter?: ICSFeedAdapter | null;
  taskAdapter?: TodoistAdapter | null;
  calendarRefreshMinutes?: number;  // Default: 15
  tasksRefreshMinutes?: number;     // Default: 5
  calendarLookAheadDays?: number;   // Default: 14 (2 weeks)
}

// =============================================================================
// Engine Context Class
// =============================================================================

export class EngineContext {
  private data: EngineContextData = {
    calendar: null,
    tasks: null,
  };

  private config: Required<EngineContextConfig>;
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(config: EngineContextConfig = {}) {
    this.config = {
      calendarAdapter: config.calendarAdapter || null,
      taskAdapter: config.taskAdapter || null,
      calendarRefreshMinutes: config.calendarRefreshMinutes || 15,
      tasksRefreshMinutes: config.tasksRefreshMinutes || 5,
      calendarLookAheadDays: config.calendarLookAheadDays || 14,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the context - fetch initial data and set up refresh
   */
  async start(): Promise<void> {
    console.log('[EngineContext] Starting...');

    // Initial fetch
    await this.refreshAll();

    // Set up periodic refresh (every minute, checks if refresh needed)
    this.refreshInterval = setInterval(() => this.checkRefresh(), 60 * 1000);

    console.log('[EngineContext] Started');
  }

  /**
   * Stop the context
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    console.log('[EngineContext] Stopped');
  }

  /**
   * Update adapters (e.g., after onboarding)
   */
  setAdapters(config: Partial<EngineContextConfig>): void {
    if (config.calendarAdapter !== undefined) {
      this.config.calendarAdapter = config.calendarAdapter;
    }
    if (config.taskAdapter !== undefined) {
      this.config.taskAdapter = config.taskAdapter;
    }
  }

  // ---------------------------------------------------------------------------
  // Refresh Logic
  // ---------------------------------------------------------------------------

  private async checkRefresh(): Promise<void> {
    const now = new Date();

    // Check calendar
    if (this.data.calendar && now >= this.data.calendar.nextRefresh) {
      await this.refreshCalendar();
    }

    // Check tasks
    if (this.data.tasks && now >= this.data.tasks.nextRefresh) {
      await this.refreshTasks();
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.all([
      this.refreshCalendar(),
      this.refreshTasks(),
    ]);
  }

  async refreshCalendar(): Promise<void> {
    const adapter = this.config.calendarAdapter;
    if (!adapter || !adapter.isConnected()) {
      return;
    }

    try {
      const now = new Date();
      const endDate = new Date(now.getTime() + this.config.calendarLookAheadDays * 24 * 60 * 60 * 1000);

      const result = await adapter.getEvents(now, endDate);

      if (result.success && result.data) {
        this.data.calendar = {
          events: result.data,
          fetchedAt: now,
          nextRefresh: new Date(now.getTime() + this.config.calendarRefreshMinutes * 60 * 1000),
        };
        console.log(`[EngineContext] Calendar refreshed: ${result.data.length} events`);
      }
    } catch (error) {
      console.warn('[EngineContext] Calendar refresh failed:', error);
    }
  }

  async refreshTasks(): Promise<void> {
    const adapter = this.config.taskAdapter;
    if (!adapter || !adapter.isConnected()) {
      return;
    }

    try {
      const now = new Date();
      const result = await adapter.getTasks({});

      if (result.success && result.data) {
        this.data.tasks = {
          tasks: result.data,
          fetchedAt: now,
          nextRefresh: new Date(now.getTime() + this.config.tasksRefreshMinutes * 60 * 1000),
        };
        console.log(`[EngineContext] Tasks refreshed: ${result.data.length} tasks`);
      }
    } catch (error) {
      console.warn('[EngineContext] Tasks refresh failed:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Getters - What plays use
  // ---------------------------------------------------------------------------

  /**
   * Get all calendar events (next 2 weeks)
   */
  getCalendarEvents(): CalendarEvent[] {
    return this.data.calendar?.events || [];
  }

  /**
   * Get upcoming calendar events (next N hours)
   */
  getUpcomingEvents(hours: number = 24): CalendarEvent[] {
    const events = this.getCalendarEvents();
    const now = new Date();
    const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return events.filter(e => e.startTime >= now && e.startTime <= cutoff);
  }

  /**
   * Get today's events
   */
  getTodayEvents(): CalendarEvent[] {
    const events = this.getCalendarEvents();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return events.filter(e => e.startTime >= startOfDay && e.startTime < endOfDay);
  }

  /**
   * Get events for a specific date
   */
  getEventsForDate(date: Date): CalendarEvent[] {
    const events = this.getCalendarEvents();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return events.filter(e => e.startTime >= startOfDay && e.startTime < endOfDay);
  }

  /**
   * Get all tasks
   */
  getTasks(): Task[] {
    return this.data.tasks?.tasks || [];
  }

  /**
   * Get tasks due today
   */
  getTodayTasks(): Task[] {
    const tasks = this.getTasks();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return tasks.filter(t => t.dueDate && t.dueDate >= startOfDay && t.dueDate < endOfDay);
  }

  /**
   * Get overdue tasks
   */
  getOverdueTasks(): Task[] {
    const tasks = this.getTasks();
    const now = new Date();

    return tasks.filter(t => t.dueDate && t.dueDate < now && !t.completed);
  }

  // ---------------------------------------------------------------------------
  // Context Summary - For prompts
  // ---------------------------------------------------------------------------

  /**
   * Get a formatted summary for agent prompts
   */
  getContextSummary(): string {
    const parts: string[] = [];

    // Current time and user timezone (all times below shown in this zone)
    const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    parts.push(`## Current Time\n${timeStr} (${timezone})`);

    // Calendar summary - show full 2-week view (times in user timezone)
    const allEvents = this.getCalendarEvents(); // Full 2 weeks
    const hasCalendar = this.config.calendarAdapter?.isConnected();
    const tzOpt = { timeZone: timezone };

    if (allEvents.length > 0) {
      const eventLines = allEvents.map(e => {
        const dateStr = e.startTime.toLocaleDateString('en-US', { ...tzOpt, weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = e.isAllDay ? 'All day' : e.startTime.toLocaleTimeString('en-US', { ...tzOpt, hour: '2-digit', minute: '2-digit', hour12: true });

        // Build rich event info
        const parts: string[] = [`- ${dateStr} ${timeStr}: ${e.title}`];

        // Organizer
        if (e.organizer) {
          const orgName = e.organizer.name || e.organizer.email;
          parts.push(`  Organizer: ${orgName}${e.organizer.name ? ` (${e.organizer.email})` : ''}`);
        }

        // Attendees (show names/emails and status)
        if (e.attendees && e.attendees.length > 0) {
          const attendeeStrs = e.attendees.slice(0, 8).map(a => {
            const name = a.name || a.email.split('@')[0];
            const statusIcon = a.status === 'accepted' ? '✓' : a.status === 'declined' ? '✗' : a.status === 'tentative' ? '?' : '·';
            return `${statusIcon}${name}`;
          });
          const more = e.attendees.length > 8 ? ` +${e.attendees.length - 8} more` : '';
          parts.push(`  Attendees: ${attendeeStrs.join(', ')}${more}`);
        }

        // Location or conference URL
        if (e.conferenceUrl) {
          parts.push(`  Meeting: ${e.conferenceUrl.includes('zoom') ? 'Zoom' : e.conferenceUrl.includes('meet.google') ? 'Google Meet' : 'Online'}`);
        } else if (e.location && !e.location.includes('http')) {
          parts.push(`  Location: ${e.location}`);
        }

        return parts.join('\n');
      });
      parts.push(`## Calendar (next 2 weeks)\n${eventLines.join('\n')}`);
    } else if (hasCalendar) {
      parts.push(`## Calendar\nNo events in the next 2 weeks. Calendar is connected but empty.`);
    } else {
      parts.push(`## Calendar\nNo calendar connected. If user asks about calendar/meetings, tell them to connect one in settings.`);
    }

    // Add general grounding instruction (prevents inventing events like "Pratik sthala gathering at 3.30")
    parts.push(`\n## CRITICAL: Never hallucinate data\nOnly state facts from the context above. CALENDAR: Only mention events that are explicitly listed in the "Calendar" section above—never invent event names, times, locations, or gatherings. If the Calendar section is empty or says "No events", do not mention any specific meeting or event. If you don't have information about something (calendar, tasks, etc.), say so—NEVER make up data.`);

    // Tasks summary - ALWAYS include to prevent hallucination
    const todayTasks = this.getTodayTasks();
    const overdueTasks = this.getOverdueTasks();
    const hasTasks = this.config.taskAdapter?.isConnected();

    if (overdueTasks.length > 0 || todayTasks.length > 0) {
      const taskLines: string[] = [];

      if (overdueTasks.length > 0) {
        taskLines.push(`⚠️ Overdue: ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''}`);
        overdueTasks.slice(0, 3).forEach(t => {
          taskLines.push(`  - ${t.content}`);
        });
      }

      if (todayTasks.length > 0) {
        taskLines.push(`Today: ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''}`);
        todayTasks.slice(0, 5).forEach(t => {
          taskLines.push(`  - ${t.content}`);
        });
      }

      parts.push(`## Tasks\n${taskLines.join('\n')}`);
    } else if (hasTasks) {
      parts.push(`## Tasks\nNo tasks due today or overdue. Task manager is connected.`);
    } else {
      parts.push(`## Tasks\nNo task manager connected.`);
    }

    return parts.join('\n\n');
  }

  /**
   * Get full 2-week calendar view for deep context
   */
  getFullCalendarContext(): string {
    const events = this.getCalendarEvents();
    if (events.length === 0) {
      return '';
    }

    const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
    const tzOpt = { timeZone: timezone };

    // Group by date
    const byDate = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      const dateKey = event.startTime.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(event);
    }

    // Format (times in user timezone)
    const lines: string[] = ['## Calendar (next 2 weeks)'];

    const sortedDates = Array.from(byDate.keys()).sort();
    for (const dateKey of sortedDates) {
      const dayEvents = byDate.get(dateKey)!;
      const dateStr = dayEvents[0].startTime.toLocaleDateString('en-US', { ...tzOpt, weekday: 'long', month: 'short', day: 'numeric' });

      lines.push(`\n**${dateStr}**`);

      for (const e of dayEvents) {
        const timeStr = e.isAllDay ? 'All day' : e.startTime.toLocaleTimeString('en-US', { ...tzOpt, hour: '2-digit', minute: '2-digit', hour12: true });
        const calName = e.calendarName ? ` [${e.calendarName}]` : '';
        lines.push(`- ${timeStr}: ${e.title}${calName}`);
      }
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let engineContext: EngineContext | null = null;

export function getEngineContext(): EngineContext {
  if (!engineContext) {
    engineContext = new EngineContext();
  }
  return engineContext;
}

export function initEngineContext(config: EngineContextConfig): EngineContext {
  engineContext = new EngineContext(config);
  return engineContext;
}
