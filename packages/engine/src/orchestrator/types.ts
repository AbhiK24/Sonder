/**
 * Orchestrator
 *
 * The brain of a play. Decides:
 * - Which agent speaks (right voice for the moment)
 * - What perspectives to gather
 * - When to follow up on goals
 * - How to handle absence and return
 *
 * Key principle: ONE agent speaks at a time, on behalf of everyone.
 */

import type { Goal, UserProfile } from '../user/types.js';

/**
 * Context for making orchestration decisions
 */
export interface OrchestrationContext {
  // The trigger for this orchestration
  trigger: OrchestratorTrigger;

  // User state
  userProfile: UserProfile;
  lastMessageAt?: Date;
  userSentiment?: 'positive' | 'neutral' | 'negative' | 'stressed' | 'excited';

  // Conversation state
  recentTopics: string[];
  conversationTone: 'casual' | 'deep' | 'urgent' | 'celebratory' | 'supportive';

  // Goal context (if goal-related)
  relevantGoal?: Goal;

  // Play-specific context
  playContext?: Record<string, unknown>;
}

export type OrchestratorTrigger =
  | { type: 'user_message'; content: string }
  | { type: 'goal_deadline'; goal: Goal }
  | { type: 'goal_achieved'; goal: Goal }
  | { type: 'user_absent'; durationHours: number }
  | { type: 'user_return'; absentHours: number }
  | { type: 'scheduled_checkin'; checkinType: 'morning' | 'evening' }
  | { type: 'ftue_step'; step: string }
  | { type: 'proactive'; reason: string };

/**
 * Agent perspective on a topic
 */
export interface AgentPerspective {
  agentId: string;
  agentName: string;
  perspective: string;     // What this agent thinks/feels about the topic
  tone: 'encouraging' | 'grounding' | 'celebrating' | 'reflecting' | 'activating';
  shouldSpeak: boolean;    // Whether this agent wants to be the speaker
  speakPriority: number;   // 0-100, higher = more eager to speak
}

/**
 * The orchestrator's decision
 */
export interface OrchestratorDecision {
  // Which agent will speak
  speaker: {
    agentId: string;
    agentName: string;
  };

  // Perspectives from other agents to weave in
  perspectives: AgentPerspective[];

  // The composed message (speaker delivers on behalf of everyone)
  message: string;

  // Optional: schedule a follow-up
  scheduleFollowUp?: {
    delayMs: number;
    trigger: OrchestratorTrigger;
  };
}

/**
 * Speaker selection criteria for common scenarios
 */
export interface SpeakerCriteria {
  // Match user sentiment to agent strength
  sentimentToAgent: Record<string, string>;  // e.g., { 'stressed': 'sage', 'excited': 'joy' }

  // Match trigger type to agent
  triggerToAgent: Record<string, string>;    // e.g., { 'goal_achieved': 'joy', 'user_absent': 'luna' }

  // Default agent when no strong match
  defaultAgent: string;
}

/**
 * Orchestrator configuration for a play
 */
export interface OrchestratorConfig {
  playId: string;

  // All agents in this play
  agents: {
    id: string;
    name: string;
    role: string;           // e.g., "The Keeper", "The Spark"
    strength: string;       // When this agent shines: "routine", "energy", "calm", "celebration", "reflection"
    voiceStyle: string;     // How they speak: "warm", "energetic", "thoughtful", "playful", "gentle"
  }[];

  // Selection criteria
  speakerCriteria: SpeakerCriteria;

  // Goal follow-up behavior
  goalFollowUp: {
    // How many days before deadline to check in
    daysBeforeDeadline: number;
    // How to handle achieved goals
    celebrationStyle: 'big' | 'warm' | 'subtle';
    // How to handle missed/abandoned goals
    missedGoalStyle: 'supportive' | 'curious' | 'gentle';
  };

  // Absence behavior
  absenceBehavior: {
    // After how many hours to reach out
    reachOutAfterHours: number;
    // Max messages while absent
    maxAbsenceMessages: number;
  };
}

/**
 * The Orchestrator interface that plays implement
 */
export interface Orchestrator {
  config: OrchestratorConfig;

  /**
   * Select which agent should speak for this context
   */
  selectSpeaker(context: OrchestrationContext): Promise<{ agentId: string; agentName: string }>;

  /**
   * Gather perspectives from all agents on a topic
   */
  gatherPerspectives(topic: string, context: OrchestrationContext): Promise<AgentPerspective[]>;

  /**
   * Compose a message where the speaker delivers on behalf of everyone
   */
  compose(
    speaker: { agentId: string; agentName: string },
    perspectives: AgentPerspective[],
    context: OrchestrationContext
  ): Promise<string>;

  /**
   * Full orchestration: select speaker, gather perspectives, compose message
   */
  orchestrate(context: OrchestrationContext): Promise<OrchestratorDecision>;

  /**
   * Handle goal timeline events
   */
  onGoalTimelineReached(goal: Goal, context: OrchestrationContext): Promise<OrchestratorDecision>;

  /**
   * Handle user absence
   */
  onUserAbsent(hours: number, context: OrchestrationContext): Promise<OrchestratorDecision | null>;

  /**
   * Handle user return after absence
   */
  onUserReturn(absentHours: number, context: OrchestrationContext): Promise<OrchestratorDecision>;
}
