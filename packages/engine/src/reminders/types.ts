/**
 * Reminder System Types
 *
 * Supports both:
 * - Smart nudges: Automatic calendar reminders ("meeting in 15 min")
 * - User reminders: Manual reminders ("remind me to call mom at 5pm")
 */

import type { CalendarEvent } from '../integrations/types.js';

// =============================================================================
// User Reminders
// =============================================================================

export interface Reminder {
  id: string;
  userId: string;
  content: string;        // "Call mom", "Take meds"
  dueAt: Date;            // When to fire
  createdAt: Date;
  createdBy: string;      // agentId who created it
  fired: boolean;
  firedAt?: Date;
}

export interface ReminderStore {
  reminders: Reminder[];
  settings: ReminderSettings;
}

export interface ReminderSettings {
  meetingReminderMinutes: number;  // Default: 15
  enabled: boolean;                // Master switch
}

// =============================================================================
// Smart Nudges (Calendar)
// =============================================================================

export interface NudgeState {
  notifiedEventIds: Set<string>;  // Events we've already notified about
  lastCheck: Date;
}

export interface MeetingReminder {
  event: CalendarEvent;
  minutesUntil: number;
  message: string;
}

// =============================================================================
// ReminderEngine Config
// =============================================================================

export interface ReminderEngineConfig {
  meetingReminderMinutes?: number;  // Default: 15
  checkIntervalSeconds?: number;    // Default: 60
  savePath?: string;                // Default: ~/.sonder/reminders
  timezone?: string;                // Default: UTC
  quietHoursStart?: number;         // Hour (0-23)
  quietHoursEnd?: number;           // Hour (0-23)
  onReminder: (userId: string, message: string, type: ReminderType, agentId?: string) => Promise<void>;
  getUpcomingEvents: (hours: number) => CalendarEvent[];
}

export type ReminderType = 'meeting' | 'user';

// =============================================================================
// Time Parsing
// =============================================================================

export interface ParsedTime {
  date: Date;
  confidence: 'high' | 'medium' | 'low';
  interpretation: string;  // Human-readable explanation
}
