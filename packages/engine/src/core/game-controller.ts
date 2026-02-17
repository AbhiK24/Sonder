/**
 * Game Controller
 *
 * Main orchestrator that ties together all systems.
 * Handles the flow: Player input -> Router -> Response -> World Update
 */

import type {
  WorldState,
  Message,
  ConversationContext,
  RouterResult,
  LLMProvider,
  ModelConfig,
  Soul,
} from '../types/index.js';
import { Router } from './router.js';
import { WorldEngine } from './world-engine.js';
import { ConversationManager } from './conversation.js';
import { NPCManager } from '../npcs/manager.js';
import { MemoryManager } from '../memory/manager.js';
import { createProvider } from '../llm/providers.js';

export interface GameControllerOptions {
  modelConfig: ModelConfig;
  soul: Soul;
  savePath: string;
}

export class GameController {
  private provider: LLMProvider;
  private router: Router;
  private worldEngine: WorldEngine;
  private conversation: ConversationManager;
  private npcManager: NPCManager;
  private memoryManager: MemoryManager;

  private worldState: WorldState;
  private soul: Soul;
  private savePath: string;

  constructor(options: GameControllerOptions) {
    this.soul = options.soul;
    this.savePath = options.savePath;

    // Initialize LLM provider
    this.provider = createProvider(options.modelConfig);

    // Initialize subsystems
    this.router = new Router(this.provider);
    this.memoryManager = new MemoryManager(this.savePath);
    this.npcManager = new NPCManager(this.memoryManager, this.provider);
    this.worldEngine = new WorldEngine(this.provider, this.npcManager);
    this.conversation = new ConversationManager(this.provider, this.npcManager);

    // Load or initialize world state
    this.worldState = this.loadOrInitializeWorld();
  }

  /**
   * Handle player input - main entry point
   */
  async handleInput(input: string): Promise<Message[]> {
    // 1. Build context
    const context = this.buildContext();

    // 2. Route intent
    const routing = await this.router.route(input, context);

    // 3. Handle based on intent
    const responses = await this.handleIntent(routing, input, context);

    // 4. Update world state (immediate consequences)
    await this.worldEngine.processPlayerAction(input, routing, this.worldState);

    // 5. Extract and store assertions
    await this.memoryManager.extractAndStore(
      input,
      responses,
      context.currentNPC
    );

    // 6. Save state
    await this.save();

    return responses;
  }

  /**
   * Handle routing result and generate response
   */
  private async handleIntent(
    routing: RouterResult,
    input: string,
    context: ConversationContext
  ): Promise<Message[]> {
    const messages: Message[] = [];

    switch (routing.intent) {
      case 'TALK':
        if (context.currentNPC) {
          const response = await this.conversation.generateResponse(
            context.currentNPC,
            input,
            context
          );
          messages.push(response);
        }
        break;

      case 'SWITCH':
        const targetNPC = this.npcManager.getNPC(routing.target!);
        if (targetNPC) {
          if (targetNPC.status === 'present') {
            this.worldState = {
              ...this.worldState,
              // Update current NPC would go here
            };
            const greeting = await this.conversation.generateGreeting(
              targetNPC,
              context
            );
            messages.push(greeting);
          } else {
            // NPC not present - narrator explains
            const explanation = await this.conversation.generateAbsenceExplanation(
              targetNPC,
              context
            );
            messages.push(explanation);
          }
        }
        break;

      case 'LOOK':
        const sceneDescription = await this.conversation.generateSceneDescription(
          context
        );
        messages.push(sceneDescription);
        break;

      case 'OBSERVE':
        const targetForObserve = this.npcManager.getNPC(routing.target!);
        if (targetForObserve) {
          const observation = await this.conversation.generateObservation(
            targetForObserve,
            context
          );
          messages.push(observation);
        }
        break;

      case 'ACCUSE':
      case 'PRESENT':
      case 'REVEAL':
        const confrontationResponse = await this.conversation.handleConfrontation(
          routing,
          input,
          context
        );
        messages.push(...confrontationResponse);
        break;

      case 'UNCLEAR':
        const clarification = this.generateClarification(routing);
        messages.push(clarification);
        break;

      // Add other intent handlers...
    }

    return messages;
  }

  /**
   * Generate clarification request for ambiguous input
   */
  private generateClarification(routing: RouterResult): Message {
    const possibilities = routing.possibilities?.join('\n → ') ?? 'unclear';

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      speaker: 'gut',
      content: `Did you want to:\n → ${possibilities}`,
    };
  }

  /**
   * Build conversation context from current state
   */
  private buildContext(): ConversationContext {
    const presentNPCs = Array.from(this.worldState.npcs.values()).filter(
      (npc) => npc.status === 'present'
    );

    return {
      currentNPC: undefined, // Would track active conversation
      presentNPCs,
      location: 'common_room', // Would track player location
      timeOfDay: this.worldState.currentTime,
      recentMessages: [], // Would maintain message history
      activeCase: this.getActiveCase(),
      playerState: this.worldState.player,
    };
  }

  /**
   * Get currently active case if any
   */
  private getActiveCase() {
    return Array.from(this.worldState.cases.values()).find(
      (c) => c.state === 'active'
    );
  }

  /**
   * Run hourly world tick
   */
  async runWorldTick(): Promise<void> {
    const result = await this.worldEngine.tick(this.worldState);

    // Apply updates
    for (const update of result.npcUpdates) {
      const npc = this.worldState.npcs.get(update.npcId);
      if (npc) {
        // Apply mood/location changes
      }
    }

    // Process notifications
    for (const notification of result.notifications) {
      await this.sendNotification(notification);
    }

    await this.save();
  }

  /**
   * Send notification to player (via chat platform)
   */
  private async sendNotification(notification: {
    urgency: string;
    message: string;
    from: string;
  }): Promise<void> {
    // Would integrate with Telegram/Discord here
    console.log(`[${notification.urgency}] ${notification.from}: ${notification.message}`);
  }

  /**
   * Load existing world or initialize from soul
   */
  private loadOrInitializeWorld(): WorldState {
    // Would load from save file or initialize from soul
    return {
      currentDay: 1,
      currentTime: 'morning',
      weather: 'clear',
      npcs: new Map(),
      cases: new Map(),
      tensions: new Map(),
      worldFacts: [],
      recentEvents: [],
      player: {
        reputation: 30,
        casesSolved: 0,
        successRate: 0,
        typesCompleted: [],
        investigationStyle: [],
        typicalOnlineHours: [],
        lastSeen: new Date(),
      },
      tavernTier: 1,
    };
  }

  /**
   * Save world state to disk
   */
  private async save(): Promise<void> {
    // Would persist to SQLite + markdown files
  }
}
