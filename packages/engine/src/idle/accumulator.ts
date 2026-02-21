/**
 * Thought Accumulator
 *
 * Stores thoughts generated while user is away.
 * The "resource" that builds up in the idle loop.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// =============================================================================
// Types
// =============================================================================

export type ThoughtType =
  | 'reflection'    // Thinking about past conversation
  | 'observation'   // Noticed a pattern about user
  | 'question'      // Something they want to ask
  | 'memory'        // Remembered something relevant
  | 'concern'       // Worried about user
  | 'celebration'   // Excited about user's progress
  | 'idea'          // Had an idea for user
  | 'discussion';   // From inter-agent conversation

export interface AccumulatedThought {
  id: string;

  // Who had this thought
  agentId: string;

  // What kind of thought
  type: ThoughtType;

  // The actual thought content
  content: string;

  // Is this about the user specifically?
  aboutUser: boolean;

  // What triggered this thought (optional context)
  triggeredBy?: string;

  // If from inter-agent discussion, who else was involved?
  discussionWith?: string[];

  // When was this generated
  generatedAt: Date;

  // How important is this thought (1-10)
  importance: number;

  // Has user seen this thought?
  shared: boolean;

  // When was it shared (if shared)
  sharedAt?: Date;

  // Which user is this for
  userId: string;
}

export interface AccumulatorStats {
  totalThoughts: number;
  unsharedCount: number;
  byAgent: Record<string, number>;
  byType: Record<ThoughtType, number>;
}

// =============================================================================
// Accumulator
// =============================================================================

export class ThoughtAccumulator {
  private thoughts: Map<string, AccumulatedThought> = new Map();
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.load();
  }

  // ---------------------------------------------------------------------------
  // Core Methods
  // ---------------------------------------------------------------------------

  // Max unshared thoughts per user (prevent overwhelming reunions)
  private static MAX_UNSHARED_PER_USER = 10;

  /**
   * Add a new thought
   */
  add(thought: Omit<AccumulatedThought, 'id' | 'shared' | 'generatedAt'>): AccumulatedThought {
    const full: AccumulatedThought = {
      ...thought,
      id: this.generateId(),
      generatedAt: new Date(),
      shared: false,
    };

    // Cap unshared thoughts - remove oldest low-importance ones if over limit
    const unshared = this.getUnshared(thought.userId);
    if (unshared.length >= ThoughtAccumulator.MAX_UNSHARED_PER_USER) {
      // Sort by importance (ascending), then by age (oldest first)
      const toRemove = [...unshared]
        .sort((a, b) => {
          if (a.importance !== b.importance) return a.importance - b.importance;
          return new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime();
        })
        .slice(0, unshared.length - ThoughtAccumulator.MAX_UNSHARED_PER_USER + 1);

      for (const t of toRemove) {
        this.thoughts.delete(t.id);
      }
      console.log(`[ThoughtAccumulator] Removed ${toRemove.length} old thoughts for ${thought.userId} (capped at ${ThoughtAccumulator.MAX_UNSHARED_PER_USER})`);
    }

    this.thoughts.set(full.id, full);
    this.save();

    return full;
  }

  /**
   * Get all unshared thoughts for a user
   */
  getUnshared(userId: string): AccumulatedThought[] {
    return Array.from(this.thoughts.values())
      .filter(t => t.userId === userId && !t.shared)
      .sort((a, b) => b.importance - a.importance);  // Most important first
  }

  /**
   * Get unshared thoughts from a specific agent
   */
  getUnsharedByAgent(userId: string, agentId: string): AccumulatedThought[] {
    return this.getUnshared(userId).filter(t => t.agentId === agentId);
  }

  /**
   * Get thoughts since a specific time
   */
  getSince(userId: string, since: Date): AccumulatedThought[] {
    return Array.from(this.thoughts.values())
      .filter(t => t.userId === userId && new Date(t.generatedAt) >= since)
      .sort((a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime());
  }

  /**
   * Get thoughts by type
   */
  getByType(userId: string, type: ThoughtType): AccumulatedThought[] {
    return Array.from(this.thoughts.values())
      .filter(t => t.userId === userId && t.type === type);
  }

  /**
   * Mark thoughts as shared (user has seen them)
   */
  markShared(thoughtIds: string[]): void {
    const now = new Date();
    for (const id of thoughtIds) {
      const thought = this.thoughts.get(id);
      if (thought) {
        thought.shared = true;
        thought.sharedAt = now;
      }
    }
    this.save();
  }

  /**
   * Mark all unshared thoughts for a user as shared
   */
  markAllShared(userId: string): string[] {
    const unshared = this.getUnshared(userId);
    const ids = unshared.map(t => t.id);
    this.markShared(ids);
    return ids;
  }

  /**
   * Get a specific thought
   */
  get(thoughtId: string): AccumulatedThought | undefined {
    return this.thoughts.get(thoughtId);
  }

  /**
   * Delete old shared thoughts (cleanup)
   */
  cleanup(olderThanDays: number = 30): number {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (const [id, thought] of this.thoughts.entries()) {
      if (thought.shared && thought.sharedAt && new Date(thought.sharedAt).getTime() < cutoff) {
        this.thoughts.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      this.save();
    }

    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Stats & Queries
  // ---------------------------------------------------------------------------

  /**
   * Get stats for a user
   */
  getStats(userId: string): AccumulatorStats {
    const userThoughts = Array.from(this.thoughts.values())
      .filter(t => t.userId === userId);

    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const thought of userThoughts) {
      byAgent[thought.agentId] = (byAgent[thought.agentId] || 0) + 1;
      byType[thought.type] = (byType[thought.type] || 0) + 1;
    }

    return {
      totalThoughts: userThoughts.length,
      unsharedCount: userThoughts.filter(t => !t.shared).length,
      byAgent,
      byType: byType as Record<ThoughtType, number>,
    };
  }

  /**
   * Get the most recent thought from each agent
   */
  getLatestByAgent(userId: string): Map<string, AccumulatedThought> {
    const latest = new Map<string, AccumulatedThought>();

    const sorted = Array.from(this.thoughts.values())
      .filter(t => t.userId === userId && !t.shared)
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

    for (const thought of sorted) {
      if (!latest.has(thought.agentId)) {
        latest.set(thought.agentId, thought);
      }
    }

    return latest;
  }

  /**
   * Get high-importance unshared thoughts
   */
  getImportant(userId: string, minImportance: number = 7): AccumulatedThought[] {
    return this.getUnshared(userId).filter(t => t.importance >= minImportance);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateId(): string {
    return `thought_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
        for (const thought of data) {
          this.thoughts.set(thought.id, {
            ...thought,
            generatedAt: new Date(thought.generatedAt),
            sharedAt: thought.sharedAt ? new Date(thought.sharedAt) : undefined,
          });
        }
      }
    } catch (error) {
      console.warn('[ThoughtAccumulator] Failed to load:', error);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.thoughts.values());
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ThoughtAccumulator] Failed to save:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  /**
   * Get all thoughts (for debugging)
   */
  debug(): AccumulatedThought[] {
    return Array.from(this.thoughts.values());
  }
}
