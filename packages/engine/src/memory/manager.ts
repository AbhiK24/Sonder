/**
 * Memory Manager
 *
 * OpenClaw-style markdown memory files.
 * See: Wanderers_Rest_Prompts_Spec.md (Assertion Extraction)
 */

import type { NPC, Message, Assertion, NPCIdentity, NPCMemory, Statement } from '../types/index.js';
import { loadIdentity, loadMemory, loadStatements, saveMemory, saveStatements } from './files.js';

export class MemoryManager {
  private savePath: string;

  constructor(savePath: string) {
    this.savePath = savePath;
  }

  /**
   * Load all memory files for an NPC
   */
  async loadNPCMemory(npcId: string): Promise<{
    identity: NPCIdentity;
    memory: NPCMemory;
    statements: Statement[];
  }> {
    const basePath = `${this.savePath}/npcs/${npcId}`;

    return {
      identity: await loadIdentity(`${basePath}/IDENTITY.md`),
      memory: await loadMemory(`${basePath}/MEMORY.md`),
      statements: await loadStatements(`${basePath}/STATEMENTS.md`),
    };
  }

  /**
   * Extract assertions from conversation and store
   */
  async extractAndStore(
    playerInput: string,
    responses: Message[],
    npc?: NPC
  ): Promise<void> {
    if (!npc) return;

    // In production, this would use the ASSERTION_EXTRACTION_PROMPT
    // to extract facts from the conversation and update MEMORY.md

    // For now, just log
    console.log(`[Memory] Would extract assertions from conversation with ${npc.name}`);
  }

  /**
   * Log today's conversation
   */
  async logConversation(npcId: string, messages: Message[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const logPath = `${this.savePath}/npcs/${npcId}/logs/${today}.md`;

    // Append to today's log
    const content = messages
      .map((m) => `**${m.speaker}:** ${m.content}`)
      .join('\n\n');

    // Would append to file
    console.log(`[Memory] Would append to ${logPath}`);
  }

  /**
   * Get context for conversation (today + yesterday logs)
   */
  async getRecentContext(npcId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Would load and return recent logs
    return '';
  }
}
