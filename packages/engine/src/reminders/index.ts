/**
 * ReminderEngine
 *
 * Handles both:
 * - Smart nudges: Automatic calendar reminders ("meeting in 15 min")
 * - User reminders: Manual reminders ("remind me to call mom at 5pm")
 *
 * Runs a periodic check (default: every 60 seconds) and fires callbacks.
 */

import { randomUUID } from 'crypto';
import type { CalendarEvent } from '../integrations/types.js';
import type {
  Reminder,
  ReminderEngineConfig,
  ReminderType,
  NudgeState,
} from './types.js';
import { ReminderStorage } from './storage.js';
import { parseReminderTime, formatReminderTime } from './time-parser.js';

export class ReminderEngine {
  private storage: ReminderStorage;
  private nudgeState: Map<string, NudgeState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private registeredUsers: Set<string> = new Set();
  private isTickRunning: boolean = false;  // Mutex for tick
  private isFirstTick: boolean = true;     // Track first tick for batching

  private config: Required<Omit<ReminderEngineConfig, 'onReminder' | 'getUpcomingEvents'>> & {
    onReminder: ReminderEngineConfig['onReminder'];
    getUpcomingEvents: ReminderEngineConfig['getUpcomingEvents'];
  };

  constructor(config: ReminderEngineConfig) {
    this.config = {
      meetingReminderMinutes: config.meetingReminderMinutes ?? 15,
      checkIntervalSeconds: config.checkIntervalSeconds ?? 60,
      savePath: config.savePath || '',
      timezone: config.timezone ?? 'UTC',
      quietHoursStart: config.quietHoursStart ?? 22,
      quietHoursEnd: config.quietHoursEnd ?? 8,
      onReminder: config.onReminder,
      getUpcomingEvents: config.getUpcomingEvents,
    };

    this.storage = new ReminderStorage(config.savePath);
  }

  // =============================================================================
  // Lifecycle
  // =============================================================================

  start(): void {
    if (this.checkInterval) return;

    console.log(`[ReminderEngine] Started (checking every ${this.config.checkIntervalSeconds}s)`);

    // Run initial check
    this.tick();

    // Set up periodic checking
    this.checkInterval = setInterval(
      () => this.tick(),
      this.config.checkIntervalSeconds * 1000
    );
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[ReminderEngine] Stopped');
    }
  }

  // =============================================================================
  // User Registration
  // =============================================================================

  registerUser(userId: string): void {
    this.registeredUsers.add(userId);

    // Initialize nudge state
    if (!this.nudgeState.has(userId)) {
      this.nudgeState.set(userId, {
        notifiedEventIds: new Set(),
        lastCheck: new Date(),
      });
    }
  }

  unregisterUser(userId: string): void {
    this.registeredUsers.delete(userId);
    this.nudgeState.delete(userId);
  }

  // =============================================================================
  // Main Tick
  // =============================================================================

  private async tick(): Promise<void> {
    // Mutex: prevent overlapping ticks
    if (this.isTickRunning) {
      console.log('[ReminderEngine] Tick already running, skipping');
      return;
    }

    this.isTickRunning = true;
    const now = new Date();

    try {
      // Copy users to avoid mutation during iteration
      const users = Array.from(this.registeredUsers);

      for (const userId of users) {
        try {
          // Check user reminders (with batching on first tick)
          await this.checkUserReminders(userId, now, this.isFirstTick);

          // Check calendar nudges (meetings always fire, even in quiet hours)
          await this.checkCalendarNudges(userId, now);
        } catch (error) {
          console.error(`[ReminderEngine] Error for user ${userId}:`, error);
        }
      }

      this.isFirstTick = false;
    } finally {
      this.isTickRunning = false;
    }
  }

  // =============================================================================
  // User Reminders
  // =============================================================================

  private async checkUserReminders(userId: string, now: Date, batchOverdue: boolean = false): Promise<void> {
    // Respect quiet hours for user reminders
    if (this.isQuietHours(now)) {
      return;
    }

    const pending = this.storage.getPendingReminders(userId);
    const overdueReminders = pending.filter(r => r.dueAt <= now);

    if (overdueReminders.length === 0) return;

    // On restart, batch multiple overdue reminders into one message
    if (batchOverdue && overdueReminders.length > 1) {
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const veryOverdue = overdueReminders.filter(r => r.dueAt < fiveMinAgo);

      if (veryOverdue.length > 1) {
        // Batch them into a single message
        const batchMessage = `⏰ **${veryOverdue.length} Reminders** (from while I was offline):\n` +
          veryOverdue.map(r => `• ${r.content}`).join('\n');

        try {
          await this.config.onReminder(userId, batchMessage, 'user', 'luna');
          // Mark all as fired only after successful delivery
          for (const r of veryOverdue) {
            this.storage.markFired(userId, r.id);
          }
          console.log(`[ReminderEngine] Batched ${veryOverdue.length} overdue reminders for user ${userId}`);
        } catch (error) {
          console.error(`[ReminderEngine] Failed to deliver batch, will retry:`, error);
          // Don't mark as fired - will retry on next tick
        }
        return;
      }
    }

    // Process reminders one by one
    for (const reminder of overdueReminders) {
      try {
        const message = this.formatUserReminder(reminder);
        await this.config.onReminder(userId, message, 'user', reminder.createdBy);

        // Mark as fired only after successful delivery
        this.storage.markFired(userId, reminder.id);
        console.log(`[ReminderEngine] Fired reminder: "${reminder.content}" for user ${userId}`);
      } catch (error) {
        console.error(`[ReminderEngine] Failed to deliver reminder "${reminder.content}", will retry:`, error);
        // Don't mark as fired - will retry on next tick
      }
    }
  }

  private formatUserReminder(reminder: Reminder): string {
    return `⏰ **Reminder:** ${reminder.content}`;
  }

  // =============================================================================
  // Calendar Nudges (Smart Meeting Reminders)
  // =============================================================================

  private async checkCalendarNudges(userId: string, now: Date): Promise<void> {
    const state = this.nudgeState.get(userId);
    if (!state) return;

    // Get upcoming events (next hour)
    const events = this.config.getUpcomingEvents(1);

    for (const event of events) {
      const minutesUntil = (event.startTime.getTime() - now.getTime()) / 60000;
      const eventKey = this.getEventKey(event);

      // Check if we should remind (within threshold and not already notified)
      if (
        minutesUntil > 0 &&
        minutesUntil <= this.config.meetingReminderMinutes &&
        !state.notifiedEventIds.has(eventKey)
      ) {
        // Fire the reminder
        const message = this.formatMeetingReminder(event, minutesUntil);
        await this.config.onReminder(userId, message, 'meeting', 'luna');

        // Mark as notified
        state.notifiedEventIds.add(eventKey);

        console.log(`[ReminderEngine] Meeting reminder: "${event.title}" in ${Math.round(minutesUntil)}min`);
      }
    }

    // Cleanup old event IDs (events that have passed)
    this.cleanupNotifiedEvents(state, events);
  }

  private getEventKey(event: CalendarEvent): string {
    return `${event.id || event.title}-${event.startTime.toISOString()}`;
  }

  private formatMeetingReminder(event: CalendarEvent, minutesUntil: number): string {
    const mins = Math.round(minutesUntil);
    let msg = `📅 **Heads up!** You have a meeting in ${mins} minute${mins === 1 ? '' : 's'}:\n`;
    msg += `**${event.title}**`;

    if (event.location) {
      msg += `\n📍 ${event.location}`;
    }

    if (event.conferenceUrl) {
      msg += `\n🔗 [Join meeting](${event.conferenceUrl})`;
    }

    return msg;
  }

  private cleanupNotifiedEvents(state: NudgeState, currentEvents: CalendarEvent[]): void {
    const currentKeys = new Set(currentEvents.map(e => this.getEventKey(e)));

    // Remove IDs for events no longer in upcoming list (they've passed or been cancelled)
    for (const key of state.notifiedEventIds) {
      if (!currentKeys.has(key)) {
        state.notifiedEventIds.delete(key);
      }
    }
  }

  // =============================================================================
  // Quiet Hours
  // =============================================================================

  private isQuietHours(now: Date): boolean {
    const hour = now.getHours();
    const { quietHoursStart, quietHoursEnd } = this.config;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (quietHoursStart > quietHoursEnd) {
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }

    // Same-day quiet hours (e.g., 14:00 - 16:00)
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }

  // =============================================================================
  // Public API - User Reminders
  // =============================================================================

  createReminder(
    userId: string,
    content: string,
    timeInput: string,
    agentId: string = 'luna'
  ): { reminder: Reminder; interpretation: string } {
    const parsed = parseReminderTime(timeInput, this.config.timezone);

    const reminder: Reminder = {
      id: randomUUID(),
      userId,
      content,
      dueAt: parsed.date,
      createdAt: new Date(),
      createdBy: agentId,
      fired: false,
    };

    this.storage.addReminder(userId, reminder);

    console.log(`[ReminderEngine] Created reminder: "${content}" at ${parsed.date.toISOString()}`);

    return {
      reminder,
      interpretation: parsed.interpretation,
    };
  }

  getReminders(userId: string): Reminder[] {
    return this.storage.getPendingReminders(userId);
  }

  cancelReminder(userId: string, reminderId: string): boolean {
    return this.storage.cancelReminder(userId, reminderId);
  }

  cancelReminderByContent(userId: string, searchTerm: string): Reminder | undefined {
    const reminder = this.storage.findReminderByContent(userId, searchTerm);
    if (reminder) {
      this.storage.cancelReminder(userId, reminder.id);
      return reminder;
    }
    return undefined;
  }

  // =============================================================================
  // Settings
  // =============================================================================

  setMeetingReminderMinutes(userId: string, minutes: number): void {
    this.storage.updateSettings(userId, { meetingReminderMinutes: minutes });
  }

  getMeetingReminderMinutes(userId: string): number {
    return this.storage.getSettings(userId).meetingReminderMinutes;
  }
}

// Re-export types and utilities
export * from './types.js';
export { parseReminderTime, formatReminderTime } from './time-parser.js';
export { ReminderStorage } from './storage.js';
