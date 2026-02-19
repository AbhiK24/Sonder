/**
 * Base Orchestrator Implementation
 *
 * Provides default behavior that plays can extend.
 * The key insight: the right agent speaks for the moment,
 * and they speak on behalf of everyone.
 */

import type {
  Orchestrator,
  OrchestratorConfig,
  OrchestrationContext,
  OrchestratorDecision,
  AgentPerspective,
} from './types.js';
import type { Goal } from '../user/types.js';
import type { LLMAdapter } from '../llm/types.js';

export class BaseOrchestrator implements Orchestrator {
  config: OrchestratorConfig;
  private llm: LLMAdapter;

  constructor(config: OrchestratorConfig, llm: LLMAdapter) {
    this.config = config;
    this.llm = llm;
  }

  /**
   * Select the right agent for this moment
   */
  async selectSpeaker(context: OrchestrationContext): Promise<{ agentId: string; agentName: string }> {
    const { trigger, userSentiment } = context;
    const criteria = this.config.speakerCriteria;

    // 1. Check trigger-based selection
    if (criteria.triggerToAgent[trigger.type]) {
      const agentId = criteria.triggerToAgent[trigger.type];
      const agent = this.config.agents.find(a => a.id === agentId);
      if (agent) {
        return { agentId: agent.id, agentName: agent.name };
      }
    }

    // 2. Check sentiment-based selection
    if (userSentiment && criteria.sentimentToAgent[userSentiment]) {
      const agentId = criteria.sentimentToAgent[userSentiment];
      const agent = this.config.agents.find(a => a.id === agentId);
      if (agent) {
        return { agentId: agent.id, agentName: agent.name };
      }
    }

    // 3. Use LLM to decide based on context
    const agentDescriptions = this.config.agents
      .map(a => `- ${a.name} (${a.role}): Strength is ${a.strength}, speaks in a ${a.voiceStyle} way`)
      .join('\n');

    const prompt = `Given this context, which agent should speak?

Context:
- Trigger: ${trigger.type}
- User sentiment: ${userSentiment || 'unknown'}
- Recent topics: ${context.recentTopics.join(', ') || 'none'}
- Conversation tone: ${context.conversationTone}

Agents:
${agentDescriptions}

Respond with just the agent name (e.g., "Luna" or "Ember"). Choose the agent whose strength best matches this moment.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        maxTokens: 50,
        temperature: 0.3,
      });

      const chosenName = response.trim();
      const agent = this.config.agents.find(
        a => a.name.toLowerCase() === chosenName.toLowerCase()
      );

      if (agent) {
        return { agentId: agent.id, agentName: agent.name };
      }
    } catch (e) {
      // Fall through to default
    }

    // 4. Default agent
    const defaultAgent = this.config.agents.find(a => a.id === criteria.defaultAgent);
    return defaultAgent
      ? { agentId: defaultAgent.id, agentName: defaultAgent.name }
      : { agentId: this.config.agents[0].id, agentName: this.config.agents[0].name };
  }

  /**
   * Gather perspectives from all agents
   */
  async gatherPerspectives(topic: string, context: OrchestrationContext): Promise<AgentPerspective[]> {
    const perspectives: AgentPerspective[] = [];

    for (const agent of this.config.agents) {
      const prompt = `You are ${agent.name}, ${agent.role}. Your strength is ${agent.strength} and you speak in a ${agent.voiceStyle} way.

The user is dealing with: "${topic}"

User context:
- Recent win: ${context.userProfile.context.recentWin || 'unknown'}
- Recent struggle: ${context.userProfile.context.recentStruggle || 'unknown'}
- Current trigger: ${context.trigger.type}

In 1-2 sentences, what's your perspective on this? What would you want the user to know?
Be true to your character and voice.`;

      try {
        const response = await this.llm.generateResponse(prompt, {
          maxTokens: 150,
          temperature: 0.7,
        });

        // Determine tone from agent's strength
        const toneMap: Record<string, AgentPerspective['tone']> = {
          'routine': 'grounding',
          'memory': 'grounding',
          'energy': 'activating',
          'activation': 'activating',
          'calm': 'grounding',
          'wisdom': 'grounding',
          'celebration': 'celebrating',
          'joy': 'celebrating',
          'reflection': 'reflecting',
          'validation': 'reflecting',
        };

        const tone = toneMap[agent.strength.toLowerCase()] || 'encouraging';

        perspectives.push({
          agentId: agent.id,
          agentName: agent.name,
          perspective: response.trim(),
          tone,
          shouldSpeak: false, // Will be determined by selectSpeaker
          speakPriority: this.calculateSpeakPriority(agent, context),
        });
      } catch (e) {
        // Skip this agent if generation fails
        console.error(`Failed to get perspective from ${agent.name}:`, e);
      }
    }

    return perspectives;
  }

  /**
   * Calculate how eager an agent is to speak in this context
   */
  private calculateSpeakPriority(
    agent: OrchestratorConfig['agents'][0],
    context: OrchestrationContext
  ): number {
    let priority = 50; // Base priority

    // Match trigger to strength
    const triggerStrengthMatch: Record<string, string[]> = {
      'user_message': ['memory', 'routine', 'reflection'],
      'goal_deadline': ['energy', 'activation', 'calm', 'wisdom'],
      'goal_achieved': ['celebration', 'joy'],
      'user_absent': ['memory', 'routine', 'reflection'],
      'user_return': ['celebration', 'joy', 'memory'],
      'scheduled_checkin': ['memory', 'routine'],
    };

    const matchingStrengths = triggerStrengthMatch[context.trigger.type] || [];
    if (matchingStrengths.some(s => agent.strength.toLowerCase().includes(s))) {
      priority += 30;
    }

    // Match sentiment to strength
    const sentimentStrengthMatch: Record<string, string[]> = {
      'stressed': ['calm', 'wisdom', 'grounding'],
      'excited': ['celebration', 'joy', 'energy'],
      'negative': ['reflection', 'validation', 'calm'],
      'positive': ['celebration', 'energy'],
    };

    if (context.userSentiment) {
      const sentimentMatch = sentimentStrengthMatch[context.userSentiment] || [];
      if (sentimentMatch.some(s => agent.strength.toLowerCase().includes(s))) {
        priority += 20;
      }
    }

    return Math.min(100, priority);
  }

  /**
   * Compose message where speaker delivers on behalf of everyone
   */
  async compose(
    speaker: { agentId: string; agentName: string },
    perspectives: AgentPerspective[],
    context: OrchestrationContext
  ): Promise<string> {
    const speakerAgent = this.config.agents.find(a => a.id === speaker.agentId);
    if (!speakerAgent) {
      throw new Error(`Speaker agent ${speaker.agentId} not found`);
    }

    const otherPerspectives = perspectives
      .filter(p => p.agentId !== speaker.agentId)
      .map(p => `${p.agentName}: "${p.perspective}"`)
      .join('\n');

    const prompt = `You are ${speakerAgent.name}, ${speakerAgent.role}. You speak in a ${speakerAgent.voiceStyle} way.

You're sending a message to the user about: ${context.trigger.type}

The other agents have shared their thoughts with you:
${otherPerspectives || 'No other perspectives to include.'}

Your job:
1. Speak in your own voice (${speakerAgent.voiceStyle})
2. Weave in 1-2 perspectives from others naturally (e.g., "Ember wanted me to tell you..." or "Sage mentioned...")
3. Keep it conversational and warm
4. End with something that invites response or creates space

User context:
- Name: ${context.userProfile.name || 'friend'}
- Recent win: ${context.userProfile.context.recentWin || 'unknown'}
- Relevant goal: ${context.relevantGoal?.statement || 'none mentioned'}

Write the message (2-4 paragraphs max). Be genuine, not performative.`;

    const response = await this.llm.generateResponse(prompt, {
      maxTokens: 400,
      temperature: 0.8,
    });

    return response.trim();
  }

  /**
   * Full orchestration flow
   */
  async orchestrate(context: OrchestrationContext): Promise<OrchestratorDecision> {
    // 1. Select speaker
    const speaker = await this.selectSpeaker(context);

    // 2. Gather perspectives
    const topic = this.extractTopic(context);
    const perspectives = await this.gatherPerspectives(topic, context);

    // Mark the speaker
    perspectives.forEach(p => {
      p.shouldSpeak = p.agentId === speaker.agentId;
    });

    // 3. Compose message
    const message = await this.compose(speaker, perspectives, context);

    return {
      speaker,
      perspectives,
      message,
    };
  }

  /**
   * Extract topic from context
   */
  private extractTopic(context: OrchestrationContext): string {
    switch (context.trigger.type) {
      case 'user_message':
        return context.trigger.content;
      case 'goal_deadline':
      case 'goal_achieved':
        return context.trigger.goal.statement;
      case 'user_absent':
        return `User has been away for ${context.trigger.durationHours} hours`;
      case 'user_return':
        return `User returning after ${context.trigger.absentHours} hours`;
      case 'scheduled_checkin':
        return `${context.trigger.checkinType} check-in`;
      default:
        return 'general check-in';
    }
  }

  /**
   * Handle goal timeline approaching/reached
   */
  async onGoalTimelineReached(goal: Goal, context: OrchestrationContext): Promise<OrchestratorDecision> {
    const goalContext: OrchestrationContext = {
      ...context,
      trigger: { type: 'goal_deadline', goal },
      relevantGoal: goal,
      conversationTone: 'supportive',
    };

    return this.orchestrate(goalContext);
  }

  /**
   * Handle user absence
   */
  async onUserAbsent(hours: number, context: OrchestrationContext): Promise<OrchestratorDecision | null> {
    const { absenceBehavior } = this.config;

    // Don't reach out if they haven't been gone long enough
    if (hours < absenceBehavior.reachOutAfterHours) {
      return null;
    }

    const absentContext: OrchestrationContext = {
      ...context,
      trigger: { type: 'user_absent', durationHours: hours },
      conversationTone: 'supportive',
    };

    return this.orchestrate(absentContext);
  }

  /**
   * Handle user return after absence
   */
  async onUserReturn(absentHours: number, context: OrchestrationContext): Promise<OrchestratorDecision> {
    const returnContext: OrchestrationContext = {
      ...context,
      trigger: { type: 'user_return', absentHours },
      conversationTone: absentHours > 48 ? 'supportive' : 'casual',
    };

    return this.orchestrate(returnContext);
  }
}
