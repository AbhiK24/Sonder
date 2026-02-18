/**
 * Trigger Scheduler
 *
 * Fires actions based on conditions.
 * Conditions can be time-based, pattern-based, event-based, etc.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Pattern } from './patterns.js';

// =============================================================================
// Types
// =============================================================================

export type TriggerType =
  | 'scheduled'     // Fires at specific times (cron-like)
  | 'pattern'       // Fires when pattern condition met
  | 'event'         // Fires on specific events
  | 'inactivity'    // Fires after inactivity period
  | 'task'          // Fires based on task state
  | 'compound';     // Multiple conditions (AND/OR)

export type TriggerAction =
  | 'message'       // Send a proactive message
  | 'check_in'      // Morning/evening check-in
  | 'nudge'         // Gentle reminder about something
  | 'celebrate'     // Celebrate an accomplishment
  | 'reflect'       // Prompt for reflection
  | 'custom';       // Play-defined action

export interface Trigger {
  id: string;
  userId: string;
  name: string;
  description: string;

  // What type of trigger
  type: TriggerType;

  // The condition
  condition: TriggerCondition;

  // What to do when triggered
  action: TriggerAction;
  actionConfig: TriggerActionConfig;

  // Which agent should act
  agentId?: string;            // Specific agent, or let system choose

  // Scheduling
  enabled: boolean;
  cooldownMinutes: number;     // Min time between firings
  maxFiringsPerDay: number;    // Cap on daily firings
  quietHoursRespect: boolean;  // Respect user's quiet hours

  // State
  lastFired?: Date;
  totalFirings: number;
  todayFirings: number;
  lastResetDate: string;       // YYYY-MM-DD

  // Metadata
  createdAt: Date;
  createdFrom?: string;        // Pattern ID if auto-created from pattern
  priority: number;            // Higher = more important (0-10)
}

export interface TriggerCondition {
  // Scheduled: cron-like expression
  schedule?: ScheduleCondition;

  // Pattern: based on observed pattern
  pattern?: PatternCondition;

  // Event: specific event occurred
  event?: EventCondition;

  // Inactivity: user hasn't been active
  inactivity?: InactivityCondition;

  // Task: based on task state
  task?: TaskCondition;

  // Compound: multiple conditions
  compound?: CompoundCondition;
}

export interface ScheduleCondition {
  // Simple scheduling (not full cron)
  hour?: number;               // 0-23
  minute?: number;             // 0-59
  daysOfWeek?: number[];       // 0-6 (Sunday-Saturday)
  timezone?: string;
}

export interface PatternCondition {
  patternId?: string;          // Specific pattern
  patternShortForm?: string;   // Or match by short form
  minConfidence?: number;      // Min pattern confidence
}

export interface EventCondition {
  eventName: string;           // e.g., "task_completed", "calendar_event_soon"
  eventData?: Record<string, unknown>;  // Additional event data to match
}

export interface InactivityCondition {
  minutes: number;             // Fire after this many minutes inactive
}

export interface TaskCondition {
  taskId?: string;             // Specific task
  taskContains?: string;       // Or task content contains
  status?: 'pending' | 'overdue';
  daysOld?: number;            // Task older than N days
}

export interface CompoundCondition {
  operator: 'AND' | 'OR';
  conditions: TriggerCondition[];
}

export interface TriggerActionConfig {
  // For 'message' action
  messageTemplate?: string;    // Template with {variables}

  // For 'check_in' action
  checkInType?: 'morning' | 'evening' | 'weekly';

  // For 'nudge' action
  nudgeSubject?: string;       // What to nudge about
  nudgeTone?: 'gentle' | 'direct' | 'playful';

  // For 'celebrate' action
  celebrateWhat?: string;

  // For 'custom' action
  customAction?: string;
  customData?: Record<string, unknown>;
}

export interface FiredTrigger {
  triggerId: string;
  userId: string;
  agentId: string;
  action: TriggerAction;
  actionConfig: TriggerActionConfig;
  firedAt: Date;
  reason: string;
}

// =============================================================================
// Trigger Scheduler
// =============================================================================

export class TriggerScheduler {
  private triggers: Map<string, Trigger> = new Map();
  private storagePath: string;

  private checkInterval: NodeJS.Timeout | null = null;
  private onFireCallbacks: Array<(fired: FiredTrigger) => void | Promise<void>> = [];

  // External context providers
  private contextProviders: {
    getPatterns?: (userId: string) => Pattern[];
    isQuietHours?: (userId: string) => boolean;
    isUserActive?: (userId: string) => boolean;
    getTaskState?: (userId: string, taskId: string) => { status: string; daysOld: number } | undefined;
  } = {};

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.load();
  }

  /**
   * Set context providers (called by InsightEngine)
   */
  setContextProviders(providers: typeof this.contextProviders): void {
    this.contextProviders = { ...this.contextProviders, ...providers };
  }

  // ---------------------------------------------------------------------------
  // Trigger Management
  // ---------------------------------------------------------------------------

  /**
   * Create a new trigger
   */
  create(trigger: Omit<Trigger, 'id' | 'createdAt' | 'totalFirings' | 'todayFirings' | 'lastResetDate'>): Trigger {
    const newTrigger: Trigger = {
      ...trigger,
      id: this.generateId(),
      createdAt: new Date(),
      totalFirings: 0,
      todayFirings: 0,
      lastResetDate: this.getTodayDate(),
    };

    this.triggers.set(newTrigger.id, newTrigger);
    this.save();

    return newTrigger;
  }

  /**
   * Create trigger from pattern (auto-generate)
   */
  createFromPattern(pattern: Pattern, userId: string): Trigger | null {
    if (!pattern.actionable || !pattern.suggestedAction) {
      return null;
    }

    // Check if trigger already exists for this pattern
    const existing = Array.from(this.triggers.values())
      .find(t => t.createdFrom === pattern.id);

    if (existing) {
      return existing;
    }

    // Determine trigger type and condition based on pattern
    let condition: TriggerCondition = {};
    let action: TriggerAction = 'nudge';

    if (pattern.category === 'task' && pattern.shortForm.startsWith('avoiding_')) {
      // Task avoidance → check task condition
      condition = {
        task: {
          taskContains: pattern.subjects?.[0],
          status: 'pending',
          daysOld: 2,
        },
      };
      action = 'nudge';
    } else if (pattern.category === 'temporal') {
      // Temporal → schedule based on pattern
      const hour = pattern.shortForm.includes('morning') ? 9 : 20;
      condition = {
        schedule: { hour, minute: 0 },
      };
      action = 'check_in';
    } else if (pattern.category === 'emotional' && pattern.valence === 'negative') {
      // Emotional → proactive check-in
      const dayMatch = pattern.shortForm.match(/^(\w+)_blues$/);
      if (dayMatch) {
        const dayName = dayMatch[1];
        const dayNum = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName);
        if (dayNum >= 0) {
          // Check in the day before, in the evening
          const prevDay = dayNum === 0 ? 6 : dayNum - 1;
          condition = {
            schedule: { hour: 19, minute: 0, daysOfWeek: [prevDay] },
          };
          action = 'check_in';
        }
      }
    } else if (pattern.category === 'growth' && pattern.valence === 'positive') {
      // Growth → celebrate
      action = 'celebrate';
      condition = {
        event: { eventName: 'pattern_detected', eventData: { patternId: pattern.id } },
      };
    }

    return this.create({
      userId,
      name: `Auto: ${pattern.shortForm}`,
      description: pattern.suggestedAction,
      type: Object.keys(condition)[0] as TriggerType || 'pattern',
      condition,
      action,
      actionConfig: {
        nudgeSubject: pattern.subjects?.[0],
        nudgeTone: 'gentle',
      },
      enabled: true,
      cooldownMinutes: 60 * 24,  // Once per day
      maxFiringsPerDay: 1,
      quietHoursRespect: true,
      createdFrom: pattern.id,
      priority: Math.round(pattern.confidence * 10),
    });
  }

  /**
   * Get trigger by ID
   */
  get(triggerId: string): Trigger | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * Get all triggers for a user
   */
  getForUser(userId: string): Trigger[] {
    return Array.from(this.triggers.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get enabled triggers
   */
  getEnabled(userId: string): Trigger[] {
    return this.getForUser(userId).filter(t => t.enabled);
  }

  /**
   * Update a trigger
   */
  update(triggerId: string, updates: Partial<Trigger>): void {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      Object.assign(trigger, updates);
      this.save();
    }
  }

  /**
   * Delete a trigger
   */
  delete(triggerId: string): void {
    this.triggers.delete(triggerId);
    this.save();
  }

  /**
   * Enable/disable a trigger
   */
  setEnabled(triggerId: string, enabled: boolean): void {
    this.update(triggerId, { enabled });
  }

  // ---------------------------------------------------------------------------
  // Trigger Checking
  // ---------------------------------------------------------------------------

  /**
   * Start periodic trigger checking
   */
  start(intervalMinutes: number = 5): void {
    if (this.checkInterval) return;

    // Run immediately
    this.checkAllTriggers();

    // Then run periodically
    this.checkInterval = setInterval(
      () => this.checkAllTriggers(),
      intervalMinutes * 60 * 1000
    );

    console.log(`[TriggerScheduler] Started (checking every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop checking
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[TriggerScheduler] Stopped');
    }
  }

  /**
   * Register callback for when trigger fires
   */
  onFire(callback: (fired: FiredTrigger) => void | Promise<void>): void {
    this.onFireCallbacks.push(callback);
  }

  /**
   * Check all triggers
   */
  async checkAllTriggers(): Promise<FiredTrigger[]> {
    const fired: FiredTrigger[] = [];
    const now = new Date();

    // Reset daily counts if needed
    this.resetDailyCounts();

    for (const trigger of this.triggers.values()) {
      if (!trigger.enabled) continue;

      try {
        const shouldFire = await this.shouldFire(trigger, now);
        if (shouldFire) {
          const result = await this.fire(trigger, now);
          if (result) {
            fired.push(result);
          }
        }
      } catch (error) {
        console.error(`[TriggerScheduler] Error checking trigger ${trigger.id}:`, error);
      }
    }

    return fired;
  }

  /**
   * Check if a trigger should fire
   */
  private async shouldFire(trigger: Trigger, now: Date): Promise<boolean> {
    // Check cooldown
    if (trigger.lastFired) {
      const minutesSinceLast = (now.getTime() - new Date(trigger.lastFired).getTime()) / 1000 / 60;
      if (minutesSinceLast < trigger.cooldownMinutes) {
        return false;
      }
    }

    // Check daily limit
    if (trigger.todayFirings >= trigger.maxFiringsPerDay) {
      return false;
    }

    // Check quiet hours
    if (trigger.quietHoursRespect && this.contextProviders.isQuietHours?.(trigger.userId)) {
      return false;
    }

    // Check condition
    return this.evaluateCondition(trigger.condition, trigger.userId, now);
  }

  /**
   * Evaluate a trigger condition
   */
  private async evaluateCondition(condition: TriggerCondition, userId: string, now: Date): Promise<boolean> {
    // Schedule condition
    if (condition.schedule) {
      if (!this.checkSchedule(condition.schedule, now)) {
        return false;
      }
    }

    // Pattern condition
    if (condition.pattern) {
      if (!this.checkPattern(condition.pattern, userId)) {
        return false;
      }
    }

    // Inactivity condition
    if (condition.inactivity) {
      if (this.contextProviders.isUserActive?.(userId)) {
        return false;
      }
    }

    // Task condition
    if (condition.task) {
      if (!this.checkTask(condition.task, userId)) {
        return false;
      }
    }

    // Compound condition
    if (condition.compound) {
      const results = await Promise.all(
        condition.compound.conditions.map(c => this.evaluateCondition(c, userId, now))
      );

      if (condition.compound.operator === 'AND') {
        return results.every(r => r);
      } else {
        return results.some(r => r);
      }
    }

    return true;
  }

  private checkSchedule(schedule: ScheduleCondition, now: Date): boolean {
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay();

    // Check hour (with 5-minute window)
    if (schedule.hour !== undefined) {
      if (hour !== schedule.hour) return false;
      if (schedule.minute !== undefined && Math.abs(minute - schedule.minute) > 5) {
        return false;
      }
    }

    // Check day of week
    if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
      if (!schedule.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }
    }

    return true;
  }

  private checkPattern(condition: PatternCondition, userId: string): boolean {
    if (!this.contextProviders.getPatterns) return false;

    const patterns = this.contextProviders.getPatterns(userId);
    const pattern = patterns.find(p =>
      (condition.patternId && p.id === condition.patternId) ||
      (condition.patternShortForm && p.shortForm === condition.patternShortForm)
    );

    if (!pattern) return false;

    if (condition.minConfidence && pattern.confidence < condition.minConfidence) {
      return false;
    }

    return true;
  }

  private checkTask(condition: TaskCondition, userId: string): boolean {
    if (!this.contextProviders.getTaskState) return false;

    if (condition.taskId) {
      const state = this.contextProviders.getTaskState(userId, condition.taskId);
      if (!state) return false;

      if (condition.status && state.status !== condition.status) return false;
      if (condition.daysOld && state.daysOld < condition.daysOld) return false;
    }

    return true;
  }

  /**
   * Fire a trigger
   */
  private async fire(trigger: Trigger, now: Date): Promise<FiredTrigger | null> {
    const fired: FiredTrigger = {
      triggerId: trigger.id,
      userId: trigger.userId,
      agentId: trigger.agentId || 'system',
      action: trigger.action,
      actionConfig: trigger.actionConfig,
      firedAt: now,
      reason: trigger.description,
    };

    // Update trigger state
    trigger.lastFired = now;
    trigger.totalFirings += 1;
    trigger.todayFirings += 1;
    this.save();

    // Notify callbacks
    for (const callback of this.onFireCallbacks) {
      try {
        await callback(fired);
      } catch (error) {
        console.error('[TriggerScheduler] Callback error:', error);
      }
    }

    console.log(`[TriggerScheduler] Fired: ${trigger.name} (${trigger.action})`);

    return fired;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateId(): string {
    return `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private resetDailyCounts(): void {
    const today = this.getTodayDate();

    for (const trigger of this.triggers.values()) {
      if (trigger.lastResetDate !== today) {
        trigger.todayFirings = 0;
        trigger.lastResetDate = today;
      }
    }

    this.save();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
        for (const trigger of data) {
          this.triggers.set(trigger.id, {
            ...trigger,
            lastFired: trigger.lastFired ? new Date(trigger.lastFired) : undefined,
            createdAt: new Date(trigger.createdAt),
          });
        }
      }
    } catch (error) {
      console.warn('[TriggerScheduler] Failed to load:', error);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.triggers.values());
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[TriggerScheduler] Failed to save:', error);
    }
  }
}
