/**
 * NPC Manager
 *
 * Handles NPC loading, state, and updates.
 */

import type { NPC, LLMProvider } from '../types/index.js';
import type { MemoryManager } from '../memory/manager.js';

export class NPCManager {
  private npcs: Map<string, NPC> = new Map();
  private memoryManager: MemoryManager;
  private provider: LLMProvider;

  constructor(memoryManager: MemoryManager, provider: LLMProvider) {
    this.memoryManager = memoryManager;
    this.provider = provider;
  }

  /**
   * Load an NPC from soul files
   */
  async loadNPC(npcId: string, soulPath: string): Promise<NPC> {
    const memory = await this.memoryManager.loadNPCMemory(npcId);

    const npc: NPC = {
      id: npcId,
      name: memory.identity.name,
      archetype: 'core_cast',
      status: 'present',
      location: 'common_room',
      mood: { primary: 'neutral', intensity: 5 },
      trust: 30,
      identity: memory.identity,
      memory: memory.memory,
      statements: memory.statements,
      relationships: [],
      secrets: [],
    };

    this.npcs.set(npcId, npc);
    return npc;
  }

  /**
   * Get NPC by ID
   */
  getNPC(npcId: string): NPC | undefined {
    return this.npcs.get(npcId);
  }

  /**
   * Get all present NPCs
   */
  getPresentNPCs(): NPC[] {
    return Array.from(this.npcs.values()).filter(
      (npc) => npc.status === 'present'
    );
  }

  /**
   * Update NPC trust level
   */
  updateTrust(npcId: string, delta: number): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      npc.trust = Math.max(0, Math.min(100, npc.trust + delta));
    }
  }

  /**
   * Update NPC mood
   */
  updateMood(npcId: string, mood: NPC['mood']): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      npc.mood = mood;
    }
  }

  /**
   * Add statement to NPC's statement log
   */
  addStatement(npcId: string, content: string, day: number): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      npc.statements.push({
        content,
        day,
        context: '',
        verifiable: true,
      });
    }
  }
}
