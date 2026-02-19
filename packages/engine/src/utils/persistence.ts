/**
 * Persistence
 *
 * Save/load game state to JSON files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

export interface SavedNPCState {
  id: string;
  trust: number;
  history: Array<{ role: 'player' | 'npc'; content: string }>;
}

export interface SavedEvent {
  time: string;  // ISO string
  description: string;
  participants: string[];
  seen: boolean;
}

export interface SavedChatState {
  chatId: number;
  currentNPC: string;
  npcs: SavedNPCState[];
  lastSeen: string;  // ISO string
  events: SavedEvent[];
  day: number;
  savedAt: string;   // ISO string
  facts?: object;    // Serialized FactStore
  // Extended fields for different plays
  [key: string]: unknown;
}

export class Persistence {
  private saveDir: string;

  constructor(saveDir: string) {
    this.saveDir = saveDir;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.saveDir)) {
      mkdirSync(this.saveDir, { recursive: true });
    }
  }

  private getPath(chatId: number): string {
    return join(this.saveDir, `chat_${chatId}.json`);
  }

  save(chatIdOrState: number | SavedChatState, partialState?: Partial<SavedChatState>): void {
    let chatId: number;
    let state: Partial<SavedChatState>;

    if (typeof chatIdOrState === 'number') {
      chatId = chatIdOrState;
      state = { ...partialState, chatId, savedAt: new Date().toISOString() };
    } else {
      chatId = chatIdOrState.chatId;
      state = { ...chatIdOrState, savedAt: new Date().toISOString() };
    }

    const path = this.getPath(chatId);
    const data = JSON.stringify(state, null, 2);
    writeFileSync(path, data, 'utf-8');
  }

  load<T extends Partial<SavedChatState> = SavedChatState>(chatId: number): T | null {
    const path = this.getPath(chatId);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  delete(chatId: number): void {
    const path = this.getPath(chatId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  listSaves(): number[] {
    if (!existsSync(this.saveDir)) return [];
    const files = readdirSync(this.saveDir);
    return files
      .filter(f => f.startsWith('chat_') && f.endsWith('.json'))
      .map(f => parseInt(f.replace('chat_', '').replace('.json', '')))
      .filter(n => !isNaN(n));
  }
}
