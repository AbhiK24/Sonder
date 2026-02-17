/**
 * World Engine
 *
 * Handles world simulation - the hourly tick that makes the world feel alive.
 * See: Wanderers_Rest_WorldTick_Spec.md
 */

import type {
  WorldState,
  WorldTickResult,
  RouterResult,
  LLMProvider,
  DramaticPattern,
  Notification,
} from '../types/index.js';
import type { NPCManager } from '../npcs/manager.js';
import { WORLD_TICK_PROMPT, PATTERN_DETECTION_PROMPT } from '../prompts/world-tick.js';

export class WorldEngine {
  private provider: LLMProvider;
  private npcManager: NPCManager;

  constructor(provider: LLMProvider, npcManager: NPCManager) {
    this.provider = provider;
    this.npcManager = npcManager;
  }

  /**
   * Run hourly world tick
   * This is the heart of the living world.
   */
  async tick(state: WorldState): Promise<WorldTickResult> {
    const prompt = this.buildTickPrompt(state);
    const result = await this.provider.generateJSON<WorldTickResult>(prompt);

    return result;
  }

  /**
   * Process immediate consequences of player action
   */
  async processPlayerAction(
    input: string,
    routing: RouterResult,
    state: WorldState
  ): Promise<void> {
    // Get present NPCs who might witness/react
    const presentNPCs = Array.from(state.npcs.values()).filter(
      (npc) => npc.status === 'present'
    );

    // For significant actions, compute immediate reactions
    if (['ACCUSE', 'REVEAL', 'PRESENT'].includes(routing.intent)) {
      // Witnesses react
      for (const witness of presentNPCs) {
        if (witness.id !== routing.target) {
          // Update witness's knowledge and mood
        }
      }
    }

    // Update tensions based on action
    // Update relationships based on action
    // Check if any patterns should escalate
  }

  /**
   * Detect dramatic patterns in current world state
   */
  async detectPatterns(state: WorldState): Promise<DramaticPattern[]> {
    const prompt = this.buildPatternPrompt(state);
    const result = await this.provider.generateJSON<{ patterns: DramaticPattern[] }>(prompt);
    return result.patterns;
  }

  /**
   * Check for pending confrontations that should notify player
   */
  checkPendingConfrontations(state: WorldState): Notification[] {
    const notifications: Notification[] = [];

    // Check tensions above threshold
    for (const [key, tension] of state.tensions) {
      if (tension >= 7) {
        const [npcA, npcB] = key.split(':');
        notifications.push({
          urgency: tension >= 9 ? 'critical' : 'urgent',
          message: `Tension between ${npcA} and ${npcB} is reaching a breaking point.`,
          from: 'maren',
        });
      }
    }

    return notifications;
  }

  /**
   * Build the world tick prompt
   */
  private buildTickPrompt(state: WorldState): string {
    const npcStates = Array.from(state.npcs.values())
      .map((npc) => `- ${npc.name}: ${npc.location}, mood: ${npc.mood.primary}`)
      .join('\n');

    return WORLD_TICK_PROMPT
      .replace('{current_time}', state.currentTime)
      .replace('{npc_states}', npcStates)
      .replace('{recent_events}', state.recentEvents.map((e) => e.description).join('\n'));
  }

  /**
   * Build pattern detection prompt
   */
  private buildPatternPrompt(state: WorldState): string {
    // Build comprehensive state summary for pattern detection
    return PATTERN_DETECTION_PROMPT;
  }
}
