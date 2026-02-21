/**
 * Reminder Storage
 *
 * Persists reminders to JSON files per user.
 * Storage path: ~/.sonder/reminders/{userId}.json
 */

import * as fs from 'fs';
import { copyFileSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Reminder, ReminderStore, ReminderSettings } from './types.js';

const DEFAULT_SETTINGS: ReminderSettings = {
  meetingReminderMinutes: 15,
  enabled: true,
};

export class ReminderStorage {
  private basePath: string;
  private cache: Map<string, ReminderStore> = new Map();

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(os.homedir(), '.sonder', 'reminders');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getFilePath(userId: string): string {
    return path.join(this.basePath, `${userId}.json`);
  }

  // =============================================================================
  // Load / Save
  // =============================================================================

  load(userId: string): ReminderStore {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const filePath = this.getFilePath(userId);

    if (!fs.existsSync(filePath)) {
      const empty: ReminderStore = {
        reminders: [],
        settings: { ...DEFAULT_SETTINGS },
      };
      this.cache.set(userId, empty);
      return empty;
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);

      // Restore Date objects
      const store: ReminderStore = {
        reminders: (parsed.reminders || []).map((r: Record<string, unknown>) => ({
          ...r,
          dueAt: new Date(r.dueAt as string),
          createdAt: new Date(r.createdAt as string),
          firedAt: r.firedAt ? new Date(r.firedAt as string) : undefined,
        })),
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
        },
      };

      this.cache.set(userId, store);
      return store;
    } catch (error) {
      console.error(`[ReminderStorage] Failed to load ${filePath}:`, error);
      const empty: ReminderStore = {
        reminders: [],
        settings: { ...DEFAULT_SETTINGS },
      };
      this.cache.set(userId, empty);
      return empty;
    }
  }

  save(userId: string, store: ReminderStore): void {
    this.cache.set(userId, store);

    const filePath = this.getFilePath(userId);

    try {
      const data = JSON.stringify(store, null, 2);
      fs.writeFileSync(filePath, data, 'utf-8');
    } catch (error) {
      console.error(`[ReminderStorage] Failed to save ${filePath}:`, error);
    }
  }

  // =============================================================================
  // Reminder Operations
  // =============================================================================

  addReminder(userId: string, reminder: Reminder): void {
    const store = this.load(userId);
    store.reminders.push(reminder);
    this.save(userId, store);
  }

  getReminders(userId: string): Reminder[] {
    const store = this.load(userId);
    return store.reminders;
  }

  getPendingReminders(userId: string): Reminder[] {
    const store = this.load(userId);
    return store.reminders.filter(r => !r.fired);
  }

  markFired(userId: string, reminderId: string): void {
    const store = this.load(userId);
    const reminder = store.reminders.find(r => r.id === reminderId);
    if (reminder) {
      reminder.fired = true;
      reminder.firedAt = new Date();
      this.save(userId, store);
    }
  }

  cancelReminder(userId: string, reminderId: string): boolean {
    const store = this.load(userId);
    const index = store.reminders.findIndex(r => r.id === reminderId);
    if (index !== -1) {
      store.reminders.splice(index, 1);
      this.save(userId, store);
      return true;
    }
    return false;
  }

  findReminderByContent(userId: string, searchTerm: string): Reminder | undefined {
    const store = this.load(userId);
    const lower = searchTerm.toLowerCase();
    return store.reminders.find(r =>
      !r.fired && r.content.toLowerCase().includes(lower)
    );
  }

  // =============================================================================
  // Settings
  // =============================================================================

  getSettings(userId: string): ReminderSettings {
    const store = this.load(userId);
    return store.settings;
  }

  updateSettings(userId: string, updates: Partial<ReminderSettings>): void {
    const store = this.load(userId);
    store.settings = { ...store.settings, ...updates };
    this.save(userId, store);
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  cleanupOldReminders(userId: string, daysOld: number = 7): number {
    const store = this.load(userId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const before = store.reminders.length;
    store.reminders = store.reminders.filter(r => {
      // Keep unfired reminders
      if (!r.fired) return true;
      // Keep recently fired
      return r.firedAt && r.firedAt > cutoff;
    });
    const removed = before - store.reminders.length;

    if (removed > 0) {
      this.save(userId, store);
    }

    return removed;
  }

  // =============================================================================
  // All Users
  // =============================================================================

  getAllUserIds(): string[] {
    try {
      const files = fs.readdirSync(this.basePath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }
}
