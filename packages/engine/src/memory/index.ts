/**
 * Memory Module
 *
 * Local-only embeddings and vector storage for semantic memory.
 *
 * Usage:
 *   import { createMemory } from './memory';
 *   const memory = await createMemory('~/.sonder/memory');
 *
 *   // Store a memory
 *   await memory.remember('User mentioned they love hiking', {
 *     type: 'fact',
 *     userId: '123',
 *   });
 *
 *   // Search memories
 *   const related = await memory.recall('outdoor activities', { userId: '123' });
 */

export { embed, embedBatch, cosineSimilarity } from './embeddings.js';
export { MemoryStore, type MemoryEntry, type SearchResult } from './store.js';

import { MemoryStore, type MemoryEntry, type SearchResult } from './store.js';

/**
 * High-level memory interface
 */
export class Memory {
  private store: MemoryStore;
  private enabled = true;

  constructor(storeDir: string, namespace = 'chorus') {
    this.store = new MemoryStore(storeDir, namespace);
  }

  /**
   * Check if Ollama is available for embeddings
   */
  async checkAvailable(): Promise<boolean> {
    try {
      const { embed } = await import('./embeddings.js');
      await embed('test');
      return true;
    } catch (error) {
      console.warn('[Memory] Ollama not available, memory disabled');
      this.enabled = false;
      return false;
    }
  }

  /**
   * Store a memory
   */
  async remember(
    text: string,
    metadata: Omit<MemoryEntry['metadata'], 'timestamp'>
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.store.add(text, {
        ...metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[Memory] Failed to store:', error);
    }
  }

  /**
   * Recall relevant memories
   */
  async recall(
    query: string,
    options: {
      userId?: string;
      type?: MemoryEntry['metadata']['type'];
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    if (!this.enabled) return [];

    try {
      return await this.store.search(query, {
        limit: options.limit || 5,
        filter: (entry) => {
          if (options.userId && entry.metadata.userId !== options.userId) return false;
          if (options.type && entry.metadata.type !== options.type) return false;
          return true;
        },
      });
    } catch (error) {
      console.warn('[Memory] Failed to recall:', error);
      return [];
    }
  }

  /**
   * Get all goals for a user
   */
  getGoals(userId: string): MemoryEntry[] {
    return this.store.getByType('goal', userId);
  }

  /**
   * Get all insights for a user
   */
  getInsights(userId: string): MemoryEntry[] {
    return this.store.getByType('insight', userId);
  }

  /**
   * Get recent facts about a user
   */
  getFacts(userId: string, limit = 20): MemoryEntry[] {
    return this.store.getByType('fact', userId).slice(0, limit);
  }

  /**
   * Save to disk
   */
  save(): void {
    this.store.save();
  }

  /**
   * Get memory stats
   */
  stats(): { total: number; enabled: boolean } {
    return {
      total: this.store.count(),
      enabled: this.enabled,
    };
  }
}

/**
 * Create a memory instance
 */
export async function createMemory(storeDir: string, namespace = 'chorus'): Promise<Memory> {
  const memory = new Memory(storeDir, namespace);
  await memory.checkAvailable();
  return memory;
}
