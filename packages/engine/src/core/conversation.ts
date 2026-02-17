/**
 * Conversation Manager
 *
 * Handles NPC response generation, scene descriptions, confrontations.
 * Uses the Two Voices system: Tavern (observation) and Gut (stakes).
 */

import type {
  NPC,
  Message,
  ConversationContext,
  RouterResult,
  LLMProvider,
} from '../types/index.js';
import type { NPCManager } from '../npcs/manager.js';
import {
  NPC_RESPONSE_PROMPT,
  TAVERN_VOICE_PROMPT,
  GUT_VOICE_PROMPT,
  CONFRONTATION_PROMPT,
} from '../prompts/conversation.js';
import { SELF_CONSISTENCY_CHECK } from '../prompts/validation.js';

export class ConversationManager {
  private provider: LLMProvider;
  private npcManager: NPCManager;

  constructor(provider: LLMProvider, npcManager: NPCManager) {
    this.provider = provider;
    this.npcManager = npcManager;
  }

  /**
   * Generate NPC response to player input
   */
  async generateResponse(
    npc: NPC,
    input: string,
    context: ConversationContext
  ): Promise<Message> {
    const prompt = this.buildNPCPrompt(npc, input, context);

    // Generate response
    let response = await this.provider.generate(prompt);

    // Validate with self-consistency check
    const isValid = await this.validateResponse(npc, response);
    if (!isValid) {
      // Regenerate if failed validation
      response = await this.provider.generate(prompt + '\n\n[Previous response failed validation. Be more careful about voice and secrets.]');
    }

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'npc',
      npcId: npc.id,
      content: response,
    };
  }

  /**
   * Generate greeting when switching to NPC
   */
  async generateGreeting(
    npc: NPC,
    context: ConversationContext
  ): Promise<Message> {
    const prompt = this.buildGreetingPrompt(npc, context);
    const response = await this.provider.generate(prompt);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'npc',
      npcId: npc.id,
      content: response,
    };
  }

  /**
   * Generate scene description (Tavern voice)
   */
  async generateSceneDescription(context: ConversationContext): Promise<Message> {
    const prompt = this.buildTavernPrompt(context);
    const response = await this.provider.generate(prompt);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'tavern',
      content: response,
    };
  }

  /**
   * Generate observation of specific NPC (Tavern voice)
   */
  async generateObservation(
    npc: NPC,
    context: ConversationContext
  ): Promise<Message> {
    const prompt = this.buildObservationPrompt(npc, context);
    const response = await this.provider.generate(prompt);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'tavern',
      content: response,
    };
  }

  /**
   * Generate explanation for absent NPC
   */
  async generateAbsenceExplanation(
    npc: NPC,
    context: ConversationContext
  ): Promise<Message> {
    // Narrator explains where the NPC is
    const tavernVoice = `${npc.name} isn't here.\n`;

    // Gut voice adds what player might do
    const gutVoice = `\n→ Ask around about where they went?`;

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'tavern',
      content: tavernVoice + gutVoice,
    };
  }

  /**
   * Handle confrontation (accuse, present, reveal)
   */
  async handleConfrontation(
    routing: RouterResult,
    input: string,
    context: ConversationContext
  ): Promise<Message[]> {
    const messages: Message[] = [];
    const target = context.presentNPCs.find((n) => n.id === routing.target);

    if (!target) {
      return messages;
    }

    // 1. Tavern voice sets the scene
    const sceneSetup = await this.generateConfrontationScene(target, context);
    messages.push(sceneSetup);

    // 2. NPC responds to confrontation
    const prompt = this.buildConfrontationPrompt(target, routing, input, context);
    const response = await this.provider.generate(prompt);

    messages.push({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'npc',
      npcId: target.id,
      content: response,
    });

    // 3. Gut voice shows consequences
    const stakes = await this.generateStakesUpdate(target, routing, context);
    messages.push(stakes);

    return messages;
  }

  /**
   * Generate confrontation scene setup
   */
  private async generateConfrontationScene(
    target: NPC,
    context: ConversationContext
  ): Promise<Message> {
    // Tavern voice describes the moment
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'tavern',
      content: `The room goes quiet.\n\n${target.name} turns to face you.`,
    };
  }

  /**
   * Generate stakes update after confrontation
   */
  private async generateStakesUpdate(
    target: NPC,
    routing: RouterResult,
    context: ConversationContext
  ): Promise<Message> {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'gut',
      content: `→ Trust with ${target.name}: Changed\n→ Others noticed.`,
    };
  }

  /**
   * Validate response against NPC's voice and secrets
   */
  private async validateResponse(npc: NPC, response: string): Promise<boolean> {
    const prompt = SELF_CONSISTENCY_CHECK
      .replace('{npc_name}', npc.name)
      .replace('{voice_patterns}', npc.identity.voicePatterns.join(', '))
      .replace('{response_to_check}', response);

    const result = await this.provider.generateJSON<{ pass: boolean }>(prompt);
    return result.pass;
  }

  /**
   * Build NPC response prompt
   */
  private buildNPCPrompt(npc: NPC, input: string, context: ConversationContext): string {
    return NPC_RESPONSE_PROMPT
      .replace('{npc_name}', npc.name)
      .replace('{identity}', JSON.stringify(npc.identity))
      .replace('{memory}', JSON.stringify(npc.memory))
      .replace('{mood}', npc.mood.primary)
      .replace('{trust_level}', npc.trust.toString())
      .replace('{player_message}', input);
  }

  private buildGreetingPrompt(npc: NPC, context: ConversationContext): string {
    return `Generate a greeting from ${npc.name} as the player approaches.
Voice: ${npc.identity.voicePatterns.join(', ')}
Mood: ${npc.mood.primary}
Trust: ${npc.trust}
Keep it brief (1-2 sentences).`;
  }

  private buildTavernPrompt(context: ConversationContext): string {
    const presentList = context.presentNPCs
      .map((n) => `${n.name} (${n.mood.primary})`)
      .join(', ');

    return TAVERN_VOICE_PROMPT
      .replace('{time_of_day}', context.timeOfDay)
      .replace('{location}', context.location)
      .replace('{present_npcs}', presentList);
  }

  private buildObservationPrompt(npc: NPC, context: ConversationContext): string {
    return `Describe ${npc.name} in the Tavern voice (short, observational, present tense).
Current mood: ${npc.mood.primary}
What are they doing right now?
Body language, small details.
3-5 sentences max.`;
  }

  private buildConfrontationPrompt(
    npc: NPC,
    routing: RouterResult,
    input: string,
    context: ConversationContext
  ): string {
    return CONFRONTATION_PROMPT
      .replace('{npc_name}', npc.name)
      .replace('{accusation}', input)
      .replace('{trust_level}', npc.trust.toString());
  }
}
