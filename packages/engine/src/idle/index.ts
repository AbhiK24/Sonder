/**
 * Idle Engine
 *
 * The core mechanic that makes companions feel alive between sessions.
 * "The idle mechanic transforms the AI from a tool you invoke to a presence you maintain."
 *
 * The Loop:
 * 1. SESSION     - User talks with agents
 * 2. DEPARTURE   - User goes away, engine detects
 * 3. ACCUMULATION - Thoughts, reflections build up
 * 4. RETURN      - User comes back, reunion moment
 * 5. DEEPEN      - Shared history compounds
 */

import { resolve } from 'path';
import type { LLMProvider } from '../types/index.js';

// Sub-modules
export * from './detector.js';
export * from './accumulator.js';
export * from './generator.js';
export * from './reunion.js';

import { PresenceDetector, PresenceStatus, PresenceThresholds } from './detector.js';
import { ThoughtAccumulator, AccumulatedThought } from './accumulator.js';
import {
  IdleThoughtGenerator,
  ThoughtPromptBuilder,
  AgentContext,
  UserContext,
  IdleTrigger,
  GeneratorConfig,
  DiscussionGenerator,
} from './generator.js';
import { ReunionBuilder, ReunionFormatter, ReunionPayload, ReunionMessage } from './reunion.js';

// =============================================================================
// Types
// =============================================================================

export interface IdleEngineConfig {
  // Storage directory
  storageDir: string;

  // Presence detection thresholds
  presence?: Partial<PresenceThresholds>;

  // Generation config
  generation?: Partial<GeneratorConfig>;

  // How often to run idle tick (minutes)
  tickIntervalMinutes?: number;
}

export interface IdleEngineHooks {
  // Called when reunion payload is ready
  onReunion?: (payload: ReunionPayload, message: ReunionMessage) => void | Promise<void>;

  // Called when a thought is generated
  onThoughtGenerated?: (thought: AccumulatedThought) => void | Promise<void>;

  // Called when user departs
  onDeparture?: (userId: string) => void | Promise<void>;

  // Get agents for a user (Play provides this)
  getAgents: (userId: string) => AgentContext[] | Promise<AgentContext[]>;

  // Get user context (Play provides this)
  getUserContext: (userId: string, awayMinutes: number) => UserContext | Promise<UserContext>;
}

// =============================================================================
// Idle Engine
// =============================================================================

export class IdleEngine {
  // Sub-systems
  public readonly presence: PresenceDetector;
  public readonly accumulator: ThoughtAccumulator;
  public readonly generator: IdleThoughtGenerator;
  public readonly discussions: DiscussionGenerator;
  public readonly reunion: ReunionBuilder;

  private provider: LLMProvider;
  private config: IdleEngineConfig;
  private hooks: IdleEngineHooks;

  private tickInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(
    provider: LLMProvider,
    config: IdleEngineConfig,
    hooks: IdleEngineHooks
  ) {
    this.provider = provider;
    this.config = config;
    this.hooks = hooks;

    // Initialize sub-systems
    this.presence = new PresenceDetector(
      resolve(config.storageDir, 'presence.json'),
      config.presence
    );

    this.accumulator = new ThoughtAccumulator(
      resolve(config.storageDir, 'accumulated.json')
    );

    this.generator = new IdleThoughtGenerator(
      provider,
      undefined,  // Will be set by Play
      config.generation
    );

    this.discussions = new DiscussionGenerator(provider);

    this.reunion = new ReunionBuilder();

    // Wire up presence callbacks
    this.presence.onDeparture(this.handleDeparture.bind(this));
    this.presence.onReturn(this.handleReturn.bind(this));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the idle engine
   */
  start(): void {
    if (this.running) return;

    this.running = true;

    // Start presence checking
    this.presence.startChecking(5);  // Check every 5 minutes

    // Start idle tick
    const tickMinutes = this.config.tickIntervalMinutes || 10;  // Generate thoughts every 10 min
    this.tickInterval = setInterval(
      () => this.idleTick(),
      tickMinutes * 60 * 1000
    );

    console.log(`[IdleEngine] Started (tick every ${tickMinutes} minutes)`);
  }

  /**
   * Stop the idle engine
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.presence.stopChecking();

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    console.log('[IdleEngine] Stopped');
  }

  // ---------------------------------------------------------------------------
  // Activity Recording
  // ---------------------------------------------------------------------------

  /**
   * Record user activity (call on every message)
   */
  recordActivity(userId: string): void {
    this.presence.recordActivity(userId);
  }

  // ---------------------------------------------------------------------------
  // Customization (Play sets these)
  // ---------------------------------------------------------------------------

  /**
   * Set custom prompt builder
   */
  setPromptBuilder(builder: ThoughtPromptBuilder): void {
    this.generator.setPromptBuilder(builder);
  }

  /**
   * Set custom reunion formatter
   */
  setReunionFormatter(formatter: ReunionFormatter): void {
    this.reunion.setFormatter(formatter);
  }

  // ---------------------------------------------------------------------------
  // Idle Loop
  // ---------------------------------------------------------------------------

  /**
   * Run one idle tick - generate thoughts for away users
   */
  private async idleTick(): Promise<void> {
    const awayUsers = this.presence.getUsersByStatus('away');
    const dormantUsers = this.presence.getUsersByStatus('dormant');

    const allAwayUsers = [...awayUsers, ...dormantUsers];

    console.log(`[IdleEngine] Tick: ${awayUsers.length} away, ${dormantUsers.length} dormant`);

    if (allAwayUsers.length === 0) {
      // Log all known users and their status for debugging
      const allPresence = this.presence.debug();
      for (const [userId, p] of allPresence) {
        console.log(`[IdleEngine] User ${userId}: status=${p.status}, away=${this.presence.awayDuration(userId)}m`);
      }
    }

    for (const userPresence of allAwayUsers) {
      try {
        console.log(`[IdleEngine] Generating for ${userPresence.userId} (away ${this.presence.awayDuration(userPresence.userId)}m)`);
        await this.generateForUser(userPresence.userId);
      } catch (error) {
        console.error(`[IdleEngine] Failed to generate for ${userPresence.userId}:`, error);
      }
    }
  }

  /**
   * Generate thoughts for a specific away user
   */
  private async generateForUser(userId: string): Promise<void> {
    const awayMinutes = this.presence.awayDuration(userId);
    const agents = await this.hooks.getAgents(userId);
    const userContext = await this.hooks.getUserContext(userId, awayMinutes);

    console.log(`[IdleEngine] generateForUser ${userId}: ${agents.length} agents, away ${awayMinutes}m`);

    const trigger: IdleTrigger = {
      type: 'time',
      afterMinutes: awayMinutes,
    };

    // Generate thoughts for each agent (round-robin)
    let totalThoughts = 0;
    for (const agent of agents) {
      const thoughts = await this.generator.generateThoughts(agent, userContext, trigger);
      console.log(`[IdleEngine] ${agent.agentName} generated ${thoughts.length} thoughts`);

      for (const thought of thoughts) {
        const accumulated = this.accumulator.add({
          userId,
          agentId: agent.agentId,
          type: thought.type,
          content: thought.content,
          importance: thought.importance,
          aboutUser: thought.aboutUser,
          triggeredBy: thought.triggeredBy,
        });
        totalThoughts++;

        // Fire hook
        if (this.hooks.onThoughtGenerated) {
          await this.hooks.onThoughtGenerated(accumulated);
        }
      }
    }

    console.log(`[IdleEngine] Total ${totalThoughts} thoughts generated for ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle user departure
   */
  private async handleDeparture(userId: string, lastSeen: Date): Promise<void> {
    console.log(`[IdleEngine] User departed: ${userId}`);

    if (this.hooks.onDeparture) {
      await this.hooks.onDeparture(userId);
    }
  }

  /**
   * Handle user return
   */
  private async handleReturn(
    userId: string,
    awayMinutes: number,
    previousStatus: PresenceStatus
  ): Promise<void> {
    console.log(`[IdleEngine] User returned: ${userId} (away ${awayMinutes}m, was ${previousStatus})`);

    // Get accumulated thoughts
    const thoughts = this.accumulator.getUnshared(userId);
    console.log(`[IdleEngine] Found ${thoughts.length} unshared thoughts for ${userId}`);

    // Always send reunion if away 30+ minutes (the threshold for "away" status)
    if (thoughts.length === 0 && awayMinutes < 30) {
      // Brief absence, no thoughts - skip reunion
      console.log(`[IdleEngine] Skipping reunion: no thoughts and away only ${awayMinutes}m`);
      return;
    }

    // Build reunion
    const payload = this.reunion.build(userId, thoughts, awayMinutes, previousStatus);
    const message = this.reunion.format(payload);

    // DON'T mark thoughts shared yet - wait until reunion actually sends
    // The bot will call markThoughtsShared() after successful send

    // Fire hook
    if (this.hooks.onReunion) {
      await this.hooks.onReunion(payload, message);
    }
  }

  /**
   * Mark thoughts as shared (call after reunion successfully sent)
   */
  markThoughtsShared(userId: string): void {
    this.accumulator.markAllShared(userId);
    console.log(`[IdleEngine] Marked thoughts shared for ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Manual Triggers (for testing / special cases)
  // ---------------------------------------------------------------------------

  /**
   * Manually trigger thought generation for a user
   */
  async triggerGeneration(userId: string): Promise<AccumulatedThought[]> {
    await this.generateForUser(userId);
    return this.accumulator.getUnshared(userId);
  }

  /**
   * Manually trigger a reunion
   */
  async triggerReunion(userId: string): Promise<{ payload: ReunionPayload; message: ReunionMessage } | null> {
    const awayMinutes = this.presence.awayDuration(userId);
    const previousStatus = this.presence.getPresence(userId)?.status || 'away';
    const thoughts = this.accumulator.getUnshared(userId);

    if (thoughts.length === 0) {
      return null;
    }

    const payload = this.reunion.build(userId, thoughts, awayMinutes, previousStatus);
    const message = this.reunion.format(payload);

    this.accumulator.markAllShared(userId);

    return { payload, message };
  }

  /**
   * Generate a discussion between agents about the user
   */
  async generateDiscussion(
    userId: string,
    topic: string,
    agentIds?: string[]
  ): Promise<AccumulatedThought | null> {
    const allAgents = await this.hooks.getAgents(userId);
    const agents = agentIds
      ? allAgents.filter(a => agentIds.includes(a.agentId))
      : allAgents.slice(0, 3);  // Default to first 3 agents

    if (agents.length < 2) return null;

    const discussion = await this.discussions.generate(
      agents,
      await this.hooks.getUserContext(userId, this.presence.awayDuration(userId)),
      topic
    );

    // Store as a single "discussion" thought
    const content = discussion.turns
      .map(t => {
        const agent = agents.find(a => a.agentId === t.agentId);
        return `${agent?.agentName || t.agentId}: "${t.content}"`;
      })
      .join('\n');

    const thought = this.accumulator.add({
      userId,
      agentId: agents[0].agentId,  // Lead agent
      type: 'discussion',
      content,
      importance: 7,
      aboutUser: true,
      discussionWith: agents.slice(1).map(a => a.agentId),
    });

    return thought;
  }

  // ---------------------------------------------------------------------------
  // Stats & Debug
  // ---------------------------------------------------------------------------

  /**
   * Get stats for the idle engine
   */
  getStats(userId: string) {
    return {
      presence: this.presence.getPresence(userId),
      accumulator: this.accumulator.getStats(userId),
      unsharedThoughts: this.accumulator.getUnshared(userId).length,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an idle engine with default config
 */
export function createIdleEngine(
  provider: LLMProvider,
  storageDir: string,
  hooks: IdleEngineHooks
): IdleEngine {
  return new IdleEngine(
    provider,
    { storageDir },
    hooks
  );
}
