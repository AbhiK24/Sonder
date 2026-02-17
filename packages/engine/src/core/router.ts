/**
 * Conversation Router
 *
 * Determines player intent from natural language input.
 * See: Wanderers_Rest_Router_Spec.md
 */

import type {
  Intent,
  RouterResult,
  ConversationContext,
  LLMProvider,
} from '../types/index.js';
import { ROUTER_PROMPT } from '../prompts/router.js';

export class Router {
  private provider: LLMProvider;
  private confidenceThreshold = 0.8;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Route player input to determine intent
   */
  async route(
    input: string,
    context: ConversationContext
  ): Promise<RouterResult> {
    const prompt = this.buildPrompt(input, context);

    const result = await this.provider.generateJSON<RouterResult>(prompt);

    // If confidence is too low, mark as unclear
    if (result.confidence < this.confidenceThreshold) {
      return {
        ...result,
        intent: 'UNCLEAR',
        possibilities: this.extractPossibilities(result),
      };
    }

    return result;
  }

  /**
   * Build the router prompt with context
   */
  private buildPrompt(input: string, context: ConversationContext): string {
    const currentNPC = context.currentNPC?.name ?? 'none';
    const presentNPCs = context.presentNPCs.map((n) => n.name).join(', ');
    const recentMessages = context.recentMessages
      .slice(-5)
      .map((m) => `${m.speaker.toUpperCase()}: ${m.content}`)
      .join('\n');

    return ROUTER_PROMPT
      .replace('{current_npc_name}', currentNPC)
      .replace('{present_npcs}', presentNPCs)
      .replace('{location}', context.location)
      .replace('{recent_messages}', recentMessages)
      .replace('{player_input}', input);
  }

  /**
   * Extract possible intents from ambiguous result
   */
  private extractPossibilities(result: RouterResult): string[] {
    // This would be more sophisticated in practice
    return result.possibilities ?? [];
  }
}
