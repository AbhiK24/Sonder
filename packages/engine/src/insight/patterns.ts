/**
 * Pattern Store
 *
 * Stores observed patterns about the user.
 * Patterns are insights derived from user behavior over time.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// =============================================================================
// Types
// =============================================================================

export type PatternCategory =
  | 'behavior'      // How user acts (avoids tasks, procrastinates)
  | 'temporal'      // Time-based (productive mornings, Sunday blues)
  | 'emotional'     // Mood patterns (stressed about X, happy when Y)
  | 'relational'    // About relationships (mentions mom, avoids dad)
  | 'task'          // Task patterns (starts many, finishes few)
  | 'growth'        // Progress patterns (improving at X, stuck on Y)
  | 'preference';   // Preferences (likes direct feedback, hates reminders)

export type PatternValence =
  | 'positive'      // Something good (user is improving)
  | 'negative'      // Something concerning (user is struggling)
  | 'neutral';      // Just an observation

export interface Pattern {
  id: string;

  // What kind of pattern
  category: PatternCategory;
  valence: PatternValence;

  // The pattern itself
  description: string;           // "User avoids tasks for 3+ days then panics"
  shortForm: string;             // "task_avoidance"

  // Evidence
  confidence: number;            // 0-1, how sure are we
  occurrences: number;           // How many times observed
  firstObserved: Date;
  lastObserved: Date;
  evidence: PatternEvidence[];   // Supporting observations

  // Context
  subjects?: string[];           // What/who this is about ["proposal", "work"]
  timeContext?: TimeContext;     // When this pattern occurs

  // For triggers
  actionable: boolean;           // Can we do something about this?
  suggestedAction?: string;      // "Nudge after 2 days, not 3"

  // Metadata
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

export interface PatternEvidence {
  date: Date;
  observation: string;           // "User mentioned proposal, seemed stressed"
  source: 'conversation' | 'task' | 'calendar' | 'behavior' | 'inferred';
}

export interface TimeContext {
  dayOfWeek?: number[];          // 0-6 (Sunday-Saturday)
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  recurring?: boolean;
}

// =============================================================================
// Pattern Store
// =============================================================================

export class PatternStore {
  private patterns: Map<string, Pattern> = new Map();
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.load();
  }

  // ---------------------------------------------------------------------------
  // Core Methods
  // ---------------------------------------------------------------------------

  /**
   * Add or update a pattern
   */
  upsert(pattern: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt' | 'archived'>): Pattern {
    // Check if similar pattern exists
    const existing = this.findSimilar(pattern.userId, pattern.shortForm);

    if (existing) {
      // Update existing pattern
      existing.occurrences += 1;
      existing.lastObserved = new Date();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.evidence = [...existing.evidence, ...pattern.evidence].slice(-20); // Keep last 20
      existing.updatedAt = new Date();

      this.save();
      return existing;
    }

    // Create new pattern
    const newPattern: Pattern = {
      ...pattern,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      archived: false,
    };

    this.patterns.set(newPattern.id, newPattern);
    this.save();

    return newPattern;
  }

  /**
   * Get all active patterns for a user
   */
  getForUser(userId: string): Pattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.userId === userId && !p.archived)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get patterns by category
   */
  getByCategory(userId: string, category: PatternCategory): Pattern[] {
    return this.getForUser(userId).filter(p => p.category === category);
  }

  /**
   * Get actionable patterns (can create triggers)
   */
  getActionable(userId: string): Pattern[] {
    return this.getForUser(userId).filter(p => p.actionable && p.confidence > 0.5);
  }

  /**
   * Get high-confidence patterns
   */
  getHighConfidence(userId: string, minConfidence: number = 0.7): Pattern[] {
    return this.getForUser(userId).filter(p => p.confidence >= minConfidence);
  }

  /**
   * Get patterns about a specific subject
   */
  getBySubject(userId: string, subject: string): Pattern[] {
    return this.getForUser(userId)
      .filter(p => p.subjects?.some(s =>
        s.toLowerCase().includes(subject.toLowerCase())
      ));
  }

  /**
   * Find similar pattern (to avoid duplicates)
   */
  findSimilar(userId: string, shortForm: string): Pattern | undefined {
    return Array.from(this.patterns.values())
      .find(p => p.userId === userId && p.shortForm === shortForm && !p.archived);
  }

  /**
   * Add evidence to existing pattern
   */
  addEvidence(patternId: string, evidence: PatternEvidence): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.evidence.push(evidence);
      pattern.lastObserved = evidence.date;
      pattern.occurrences += 1;
      pattern.confidence = Math.min(1, pattern.confidence + 0.05);
      pattern.updatedAt = new Date();
      this.save();
    }
  }

  /**
   * Decrease confidence (pattern not observed when expected)
   */
  decreaseConfidence(patternId: string, amount: number = 0.1): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.confidence = Math.max(0, pattern.confidence - amount);
      pattern.updatedAt = new Date();

      // Archive if confidence too low
      if (pattern.confidence < 0.2) {
        pattern.archived = true;
      }

      this.save();
    }
  }

  /**
   * Archive a pattern (soft delete)
   */
  archive(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.archived = true;
      pattern.updatedAt = new Date();
      this.save();
    }
  }

  /**
   * Get pattern by ID
   */
  get(patternId: string): Pattern | undefined {
    return this.patterns.get(patternId);
  }

  // ---------------------------------------------------------------------------
  // Query Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get temporal patterns for a specific time
   */
  getTemporalPatterns(userId: string, dayOfWeek?: number, timeOfDay?: string): Pattern[] {
    return this.getByCategory(userId, 'temporal')
      .filter(p => {
        if (!p.timeContext) return false;
        if (dayOfWeek !== undefined && p.timeContext.dayOfWeek) {
          if (!p.timeContext.dayOfWeek.includes(dayOfWeek)) return false;
        }
        if (timeOfDay && p.timeContext.timeOfDay) {
          if (p.timeContext.timeOfDay !== timeOfDay) return false;
        }
        return true;
      });
  }

  /**
   * Get concerning patterns (negative, high confidence)
   */
  getConcerning(userId: string): Pattern[] {
    return this.getForUser(userId)
      .filter(p => p.valence === 'negative' && p.confidence > 0.6);
  }

  /**
   * Get positive patterns (for celebrations)
   */
  getPositive(userId: string): Pattern[] {
    return this.getForUser(userId)
      .filter(p => p.valence === 'positive' && p.confidence > 0.5);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Get stats for a user
   */
  getStats(userId: string): {
    total: number;
    byCategory: Record<PatternCategory, number>;
    byValence: Record<PatternValence, number>;
    avgConfidence: number;
  } {
    const patterns = this.getForUser(userId);

    const byCategory: Record<string, number> = {};
    const byValence: Record<string, number> = {};

    for (const p of patterns) {
      byCategory[p.category] = (byCategory[p.category] || 0) + 1;
      byValence[p.valence] = (byValence[p.valence] || 0) + 1;
    }

    const avgConfidence = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
      : 0;

    return {
      total: patterns.length,
      byCategory: byCategory as Record<PatternCategory, number>,
      byValence: byValence as Record<PatternValence, number>,
      avgConfidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private generateId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
        for (const pattern of data) {
          this.patterns.set(pattern.id, {
            ...pattern,
            firstObserved: new Date(pattern.firstObserved),
            lastObserved: new Date(pattern.lastObserved),
            createdAt: new Date(pattern.createdAt),
            updatedAt: new Date(pattern.updatedAt),
            evidence: pattern.evidence.map((e: PatternEvidence) => ({
              ...e,
              date: new Date(e.date),
            })),
          });
        }
      }
    } catch (error) {
      console.warn('[PatternStore] Failed to load:', error);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.patterns.values());
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PatternStore] Failed to save:', error);
    }
  }
}
