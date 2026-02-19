/**
 * Local Vector Store
 *
 * Simple file-based vector database.
 * Stores embeddings in JSON, uses cosine similarity for retrieval.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { embed, cosineSimilarity } from './embeddings.js';

export interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: 'message' | 'goal' | 'insight' | 'fact';
    userId: string;
    agentId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;
}

/**
 * Local Vector Store
 */
export class MemoryStore {
  private storePath: string;
  private entries: MemoryEntry[] = [];
  private dirty = false;

  constructor(storeDir: string, namespace = 'default') {
    if (!existsSync(storeDir)) {
      mkdirSync(storeDir, { recursive: true });
    }
    this.storePath = join(storeDir, `memory_${namespace}.json`);
    this.load();
  }

  /**
   * Load entries from disk
   */
  private load(): void {
    if (existsSync(this.storePath)) {
      try {
        const data = readFileSync(this.storePath, 'utf-8');
        this.entries = JSON.parse(data);
        console.log(`[Memory] Loaded ${this.entries.length} entries`);
      } catch {
        this.entries = [];
      }
    }
  }

  /**
   * Save entries to disk
   */
  save(): void {
    if (!this.dirty) return;
    writeFileSync(this.storePath, JSON.stringify(this.entries, null, 2));
    this.dirty = false;
  }

  /**
   * Add a memory with automatic embedding
   */
  async add(
    text: string,
    metadata: MemoryEntry['metadata']
  ): Promise<MemoryEntry> {
    const embedding = await embed(text);
    const entry: MemoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      embedding,
      metadata: {
        ...metadata,
        timestamp: metadata.timestamp || new Date().toISOString(),
      },
    };

    this.entries.push(entry);
    this.dirty = true;

    // Auto-save every 10 entries
    if (this.entries.length % 10 === 0) {
      this.save();
    }

    return entry;
  }

  /**
   * Search for similar memories
   */
  async search(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      filter?: (entry: MemoryEntry) => boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 5, threshold = 0.5, filter } = options;

    if (this.entries.length === 0) return [];

    const queryEmbedding = await embed(query);

    let results: SearchResult[] = this.entries
      .filter(entry => !filter || filter(entry))
      .map(entry => ({
        entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Get memories for a specific user
   */
  getByUser(userId: string, limit = 50): MemoryEntry[] {
    return this.entries
      .filter(e => e.metadata.userId === userId)
      .sort((a, b) =>
        new Date(b.metadata.timestamp).getTime() -
        new Date(a.metadata.timestamp).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Get memories by type
   */
  getByType(type: MemoryEntry['metadata']['type'], userId?: string): MemoryEntry[] {
    return this.entries.filter(e =>
      e.metadata.type === type &&
      (!userId || e.metadata.userId === userId)
    );
  }

  /**
   * Count entries
   */
  count(): number {
    return this.entries.length;
  }

  /**
   * Clear all entries (use carefully!)
   */
  clear(): void {
    this.entries = [];
    this.dirty = true;
    this.save();
  }
}
