/**
 * Idle Thought Generator
 *
 * Generates thoughts for agents while user is away.
 * Plays provide the prompts, engine provides the infrastructure.
 */

import type { LLMProvider } from '../types/index.js';
import type { AccumulatedThought, ThoughtType } from './accumulator.js';

// =============================================================================
// Types
// =============================================================================

export interface AgentContext {
  agentId: string;
  agentName: string;
  personality: string[];
  role: string;
  recentMemories?: string[];
}

export interface UserContext {
  userId: string;
  awayMinutes: number;
  lastConversationSummary?: string;
  recentTopics?: string[];
  userPatterns?: string[];
  currentTasks?: string[];
  currentMood?: string;
}

export interface IdleTrigger {
  type: 'time' | 'schedule' | 'event' | 'pattern';

  // For 'time': minutes since departure
  afterMinutes?: number;

  // For 'schedule': cron expression
  cron?: string;

  // For 'event': event name
  event?: string;

  // For 'pattern': pattern name
  pattern?: string;
}

export interface GeneratedThought {
  type: ThoughtType;
  content: string;
  importance: number;
  aboutUser: boolean;
  triggeredBy?: string;
}

/**
 * Play provides this to customize thought generation
 */
export interface ThoughtPromptBuilder {
  /**
   * Build the prompt for generating a thought
   */
  buildPrompt(
    agent: AgentContext,
    user: UserContext,
    trigger: IdleTrigger,
    thoughtType: ThoughtType
  ): string;

  /**
   * Parse LLM response into structured thought
   */
  parseResponse(response: string, thoughtType: ThoughtType): GeneratedThought | null;

  /**
   * Which thought types should this agent generate?
   */
  getThoughtTypes(agent: AgentContext, trigger: IdleTrigger): ThoughtType[];

  /**
   * Should we generate a thought right now?
   */
  shouldGenerate(agent: AgentContext, user: UserContext, trigger: IdleTrigger): boolean;
}

// =============================================================================
// Default Prompt Builder (Generic)
// =============================================================================

export const defaultPromptBuilder: ThoughtPromptBuilder = {
  buildPrompt(agent, user, trigger, thoughtType) {
    const typePrompts: Record<ThoughtType, string> = {
      reflection: `Reflect on your last conversation with the user. What stood out?`,
      observation: `What pattern have you noticed about the user recently?`,
      question: `What question would you like to ask the user?`,
      memory: `What relevant memory came to mind about the user?`,
      concern: `Is there anything about the user you're concerned about?`,
      celebration: `Is there anything the user did recently worth celebrating?`,
      idea: `Do you have an idea that might help the user?`,
      discussion: `What would you discuss about the user with your fellow agents?`,
    };

    // Get current time for temporal awareness
    const now = new Date();
    const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
    const timeStr = now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `You are ${agent.agentName}, ${agent.role}.
Personality: ${agent.personality.join(', ')}

CURRENT TIME: ${timeStr}

The user has been away for ${user.awayMinutes} minutes.
${user.lastConversationSummary ? `Last conversation: ${user.lastConversationSummary}` : ''}
${user.recentTopics?.length ? `Recent topics: ${user.recentTopics.join(', ')}` : ''}

${typePrompts[thoughtType]}

IMPORTANT: Only reference PAST events. NEVER ask about future meetings/events as if they happened.

Respond with a single thought in first person. Be genuine and in character.
Keep it to 1-2 sentences. Don't be generic.`;
  },

  parseResponse(response, thoughtType) {
    const content = response.trim();
    if (!content || content.length < 10) return null;

    // Simple importance heuristic
    let importance = 5;
    if (thoughtType === 'concern' || thoughtType === 'celebration') importance = 7;
    if (content.includes('!')) importance += 1;
    if (content.length > 200) importance += 1;

    return {
      type: thoughtType,
      content,
      importance: Math.min(10, importance),
      aboutUser: true,
    };
  },

  getThoughtTypes(agent, trigger) {
    // Default: rotate through types based on time
    const allTypes: ThoughtType[] = ['reflection', 'observation', 'question', 'memory'];

    if (trigger.afterMinutes && trigger.afterMinutes > 60) {
      allTypes.push('concern', 'idea');
    }

    return allTypes;
  },

  shouldGenerate(agent, user, trigger) {
    // Don't generate if user was only away briefly
    if (user.awayMinutes < 15) return false;  // Generate after 15 min away
    return true;
  },
};

// =============================================================================
// Idle Thought Generator
// =============================================================================

export interface GeneratorConfig {
  minIntervalMinutes: number;    // Don't generate more often than this
  maxThoughtsPerHour: number;    // Cap on thoughts per hour
  maxThoughtsPerAgent: number;   // Cap per agent while away
}

const DEFAULT_CONFIG: GeneratorConfig = {
  minIntervalMinutes: 30,
  maxThoughtsPerHour: 4,
  maxThoughtsPerAgent: 3,
};

export class IdleThoughtGenerator {
  private provider: LLMProvider;
  private promptBuilder: ThoughtPromptBuilder;
  private config: GeneratorConfig;

  // Track generation to respect limits
  private lastGeneration: Map<string, Date> = new Map();  // agentId -> lastGen
  private hourlyCount: number = 0;
  private hourlyReset: Date = new Date();

  constructor(
    provider: LLMProvider,
    promptBuilder: ThoughtPromptBuilder = defaultPromptBuilder,
    config: Partial<GeneratorConfig> = {}
  ) {
    this.provider = provider;
    this.promptBuilder = promptBuilder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set a custom prompt builder (Play provides this)
   */
  setPromptBuilder(builder: ThoughtPromptBuilder): void {
    this.promptBuilder = builder;
  }

  /**
   * Generate thoughts for an agent
   */
  async generateThoughts(
    agent: AgentContext,
    user: UserContext,
    trigger: IdleTrigger
  ): Promise<GeneratedThought[]> {
    // Check if we should generate
    if (!this.promptBuilder.shouldGenerate(agent, user, trigger)) {
      console.log(`[IdleGenerator] ${agent.agentName}: shouldGenerate=false (away ${user.awayMinutes}m)`);
      return [];
    }

    // Check rate limits
    if (!this.checkRateLimits(agent.agentId)) {
      console.log(`[IdleGenerator] ${agent.agentName}: rate limited`);
      return [];
    }

    const thoughtTypes = this.promptBuilder.getThoughtTypes(agent, trigger);
    const thoughts: GeneratedThought[] = [];

    // Pick one or two thought types to generate
    const typesToGenerate = this.selectTypes(thoughtTypes, trigger);

    for (const thoughtType of typesToGenerate) {
      try {
        const thought = await this.generateSingleThought(agent, user, trigger, thoughtType);
        if (thought) {
          thoughts.push(thought);
        }
      } catch (error) {
        console.error(`[IdleGenerator] Failed to generate ${thoughtType}:`, error);
      }
    }

    // Update tracking
    this.lastGeneration.set(agent.agentId, new Date());
    this.hourlyCount += thoughts.length;

    return thoughts;
  }

  /**
   * Generate a single thought
   */
  private async generateSingleThought(
    agent: AgentContext,
    user: UserContext,
    trigger: IdleTrigger,
    thoughtType: ThoughtType
  ): Promise<GeneratedThought | null> {
    const prompt = this.promptBuilder.buildPrompt(agent, user, trigger, thoughtType);

    const response = await this.provider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 150,
    });

    return this.promptBuilder.parseResponse(response, thoughtType);
  }

  /**
   * Select which thought types to generate
   */
  private selectTypes(available: ThoughtType[], trigger: IdleTrigger): ThoughtType[] {
    // Usually just generate 1-2 thoughts at a time
    const count = trigger.afterMinutes && trigger.afterMinutes > 120 ? 2 : 1;

    // Shuffle and take first N
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Check rate limits
   */
  private checkRateLimits(agentId: string): boolean {
    // Reset hourly count if needed
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (this.hourlyReset.getTime() < hourAgo) {
      this.hourlyCount = 0;
      this.hourlyReset = new Date();
    }

    // Check hourly limit
    if (this.hourlyCount >= this.config.maxThoughtsPerHour) {
      return false;
    }

    // Check per-agent interval
    const lastGen = this.lastGeneration.get(agentId);
    if (lastGen) {
      const minutesSince = (Date.now() - lastGen.getTime()) / 1000 / 60;
      if (minutesSince < this.config.minIntervalMinutes) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reset rate limits (for testing)
   */
  resetLimits(): void {
    this.lastGeneration.clear();
    this.hourlyCount = 0;
    this.hourlyReset = new Date();
  }
}

// =============================================================================
// Discussion Generator (for inter-agent conversations)
// =============================================================================

export interface DiscussionTurn {
  agentId: string;
  content: string;
}

export interface Discussion {
  topic: string;
  participants: string[];
  turns: DiscussionTurn[];
  conclusion?: string;
}

export class DiscussionGenerator {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Generate a discussion between agents about the user
   */
  async generate(
    agents: AgentContext[],
    user: UserContext,
    topic: string,
    turns: number = 4
  ): Promise<Discussion> {
    const discussion: Discussion = {
      topic,
      participants: agents.map(a => a.agentId),
      turns: [],
    };

    // Build the discussion turn by turn
    for (let i = 0; i < turns; i++) {
      const agent = agents[i % agents.length];
      const previousTurns = discussion.turns
        .map(t => {
          const a = agents.find(a => a.agentId === t.agentId);
          return `${a?.agentName || t.agentId}: ${t.content}`;
        })
        .join('\n');

      const prompt = `You are ${agent.agentName}, ${agent.role}.
Personality: ${agent.personality.join(', ')}

You are discussing the user with your fellow agents.
Topic: ${topic}

${previousTurns ? `Previous discussion:\n${previousTurns}\n` : ''}

Continue the discussion with your perspective. Stay in character.
Keep it to 1-2 sentences. Be specific, not generic.`;

      try {
        const response = await this.provider.generate(prompt, {
          temperature: 0.85,
          maxTokens: 100,
        });

        discussion.turns.push({
          agentId: agent.agentId,
          content: response.trim(),
        });
      } catch (error) {
        console.error(`[DiscussionGenerator] Failed at turn ${i}:`, error);
        break;
      }
    }

    return discussion;
  }
}
