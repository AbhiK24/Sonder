/**
 * Persistence
 *
 * Save/load game state to JSON files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
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

  save(state: SavedChatState): void {
    const path = this.getPath(state.chatId);
    const data = JSON.stringify(state, null, 2);
    writeFileSync(path, data, 'utf-8');
  }

  load(chatId: number): SavedChatState | null {
    const path = this.getPath(chatId);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data) as SavedChatState;
    } catch {
      return null;
    }
  }

  delete(chatId: number): void {
    const path = this.getPath(chatId);
    if (existsSync(path)) {
      const fs = require('fs');
      fs.unlinkSync(path);
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
