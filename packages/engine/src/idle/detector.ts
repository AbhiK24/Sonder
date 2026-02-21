/**
 * Presence Detector
 *
 * Tracks when users leave and return.
 * Fires events for departure and reunion.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// =============================================================================
// Types
// =============================================================================

export type PresenceStatus = 'active' | 'away' | 'dormant';

export interface UserPresence {
  userId: string;
  lastSeen: Date;
  lastSessionStart: Date;
  status: PresenceStatus;
  totalSessions: number;
  averageSessionMinutes: number;
}

export interface PresenceThresholds {
  awayAfterMinutes: number;      // 'active' → 'away' (default: 30)
  dormantAfterMinutes: number;   // 'away' → 'dormant' (default: 1440 = 24hr)
}

export type DepartureCallback = (userId: string, lastSeen: Date) => void;
export type ReturnCallback = (userId: string, awayMinutes: number, previousStatus: PresenceStatus) => void;

// =============================================================================
// Presence Detector
// =============================================================================

export class PresenceDetector {
  private presence: Map<string, UserPresence> = new Map();
  private thresholds: PresenceThresholds;
  private storagePath: string;

  private departureCallbacks: DepartureCallback[] = [];
  private returnCallbacks: ReturnCallback[] = [];

  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    storagePath: string,
    thresholds: Partial<PresenceThresholds> = {}
  ) {
    this.storagePath = storagePath;
    this.thresholds = {
      awayAfterMinutes: thresholds.awayAfterMinutes ?? 30,
      dormantAfterMinutes: thresholds.dormantAfterMinutes ?? 1440,
    };

    this.load();
  }

  // ---------------------------------------------------------------------------
  // Core Methods
  // ---------------------------------------------------------------------------

  /**
   * Record user activity (call on every message)
   */
  recordActivity(userId: string): void {
    const now = new Date();
    const existing = this.presence.get(userId);

    if (existing) {
      const previousStatus = existing.status;
      const awayMinutes = this.minutesSince(existing.lastSeen);

      // Was away, now returning
      if (previousStatus !== 'active' && awayMinutes >= this.thresholds.awayAfterMinutes) {
        console.log(`[PresenceDetector] ${userId} returned after ${awayMinutes}m (was ${previousStatus})`);
        this.fireReturn(userId, awayMinutes, previousStatus);

        // Update session stats
        existing.totalSessions += 1;
        existing.lastSessionStart = now;
      }

      existing.lastSeen = now;
      existing.status = 'active';
    } else {
      // New user
      console.log(`[PresenceDetector] New user: ${userId}`);
      this.presence.set(userId, {
        userId,
        lastSeen: now,
        lastSessionStart: now,
        status: 'active',
        totalSessions: 1,
        averageSessionMinutes: 0,
      });
    }

    this.save();
  }

  /**
   * Get presence for a user
   */
  getPresence(userId: string): UserPresence | undefined {
    const presence = this.presence.get(userId);
    if (presence) {
      // Update status based on current time
      presence.status = this.calculateStatus(presence.lastSeen);
    }
    return presence;
  }

  /**
   * Get all users with a specific status
   */
  getUsersByStatus(status: PresenceStatus): UserPresence[] {
    return Array.from(this.presence.values())
      .map(p => ({ ...p, status: this.calculateStatus(p.lastSeen) }))
      .filter(p => p.status === status);
  }

  /**
   * How long has user been away (in minutes)
   */
  awayDuration(userId: string): number {
    const presence = this.presence.get(userId);
    if (!presence) return 0;
    return this.minutesSince(presence.lastSeen);
  }

  /**
   * Is user currently away?
   */
  isAway(userId: string): boolean {
    const status = this.getPresence(userId)?.status;
    return status === 'away' || status === 'dormant';
  }

  // ---------------------------------------------------------------------------
  // Event Callbacks
  // ---------------------------------------------------------------------------

  /**
   * Register callback for when user departs
   */
  onDeparture(callback: DepartureCallback): void {
    this.departureCallbacks.push(callback);
  }

  /**
   * Register callback for when user returns
   */
  onReturn(callback: ReturnCallback): void {
    this.returnCallbacks.push(callback);
  }

  private fireDeparture(userId: string, lastSeen: Date): void {
    for (const callback of this.departureCallbacks) {
      try {
        callback(userId, lastSeen);
      } catch (error) {
        console.error('[PresenceDetector] Departure callback error:', error);
      }
    }
  }

  private fireReturn(userId: string, awayMinutes: number, previousStatus: PresenceStatus): void {
    for (const callback of this.returnCallbacks) {
      try {
        callback(userId, awayMinutes, previousStatus);
      } catch (error) {
        console.error('[PresenceDetector] Return callback error:', error);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Background Checker
  // ---------------------------------------------------------------------------

  /**
   * Start periodic status checking (for departure detection)
   */
  startChecking(intervalMinutes: number = 5): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkForDepartures();
    }, intervalMinutes * 60 * 1000);

    console.log(`[PresenceDetector] Started checking every ${intervalMinutes} minutes`);
  }

  /**
   * Stop periodic checking
   */
  stopChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[PresenceDetector] Stopped checking');
    }
  }

  private checkForDepartures(): void {
    const now = new Date();
    const userCount = this.presence.size;

    console.log(`[PresenceDetector] Checking ${userCount} users for departures`);

    for (const [userId, presence] of this.presence.entries()) {
      const minutesAway = this.minutesSince(presence.lastSeen);
      const newStatus = this.calculateStatus(presence.lastSeen);

      // Transition from active → away
      if (presence.status === 'active' && newStatus === 'away') {
        console.log(`[PresenceDetector] ${userId}: active → away (${minutesAway}m)`);
        presence.status = 'away';
        this.fireDeparture(userId, presence.lastSeen);
        this.save();
      }

      // Transition from away → dormant
      if (presence.status === 'away' && newStatus === 'dormant') {
        console.log(`[PresenceDetector] ${userId}: away → dormant (${minutesAway}m)`);
        presence.status = 'dormant';
        // Could fire a separate "gone dormant" event here
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private calculateStatus(lastSeen: Date): PresenceStatus {
    const minutes = this.minutesSince(lastSeen);

    if (minutes < this.thresholds.awayAfterMinutes) {
      return 'active';
    } else if (minutes < this.thresholds.dormantAfterMinutes) {
      return 'away';
    } else {
      return 'dormant';
    }
  }

  private minutesSince(date: Date): number {
    return Math.floor((Date.now() - new Date(date).getTime()) / 1000 / 60);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
        for (const [userId, presence] of Object.entries(data)) {
          const p = presence as UserPresence;
          this.presence.set(userId, {
            ...p,
            lastSeen: new Date(p.lastSeen),
            lastSessionStart: new Date(p.lastSessionStart),
          });
        }
        console.log(`[PresenceDetector] Loaded ${this.presence.size} users from ${this.storagePath}`);
      } else {
        console.log(`[PresenceDetector] No presence file at ${this.storagePath}`);
      }
    } catch (error) {
      console.warn('[PresenceDetector] Failed to load presence data:', error);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        console.log(`[PresenceDetector] Creating directory: ${dir}`);
        mkdirSync(dir, { recursive: true });
      }

      const data: Record<string, UserPresence> = {};
      for (const [userId, presence] of this.presence.entries()) {
        data[userId] = presence;
      }

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PresenceDetector] Failed to save presence data:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  /**
   * Get raw presence data (for debugging)
   */
  debug(): Map<string, UserPresence> {
    return new Map(this.presence);
  }
}
