/**
 * Play Abstraction Types
 *
 * A Play is the core unit of Sonder — a complete multi-agent experience.
 *
 * Supports three modes:
 * - Companion: Agents help you (Chorus)
 * - Game: Agents have secrets, you investigate (Wanderer's Rest)
 * - Simulation: Agents interact, you observe (The Office)
 *
 * Key concepts:
 * - Orchestrator: The brain that decides which agent speaks
 * - FTUE: First Time User Experience flow
 * - Goals: User goals gathered during FTUE, drive proactive behavior
 */

import type { OrchestratorConfig } from '../orchestrator/types.js';
import type { FTUEFlow } from '../ftue/types.js';

// =============================================================================
// Play Definition
// =============================================================================

export type PlayType = 'companion' | 'game' | 'simulation' | 'hybrid';

/**
 * When an agent shines - used by orchestrator for speaker selection
 */
export type AgentStrength =
  | 'routine'       // Good at daily check-ins, memory, continuity (Luna)
  | 'activation'    // Good at energy, motivation, getting started (Ember)
  | 'wisdom'        // Good at calm, perspective, grounding (Sage)
  | 'celebration'   // Good at joy, wins, positive moments (Joy)
  | 'reflection'    // Good at emotions, validation, mirroring (Echo)
  | 'hospitality'   // Good at welcome, comfort, belonging (Maera)
  | 'adventure'     // Good at action, stories, excitement (Roderick)
  | 'knowledge'     // Good at lore, information, teaching (Elara)
  | 'mischief';     // Good at humor, lightness, play (Pip)

export type UserRole =
  | 'subject'       // User is the subject of agent attention (Companion)
  | 'participant'   // User is an active participant in the world (Game)
  | 'investigator'  // User is investigating agents (Mystery)
  | 'observer';     // User watches agents interact (Simulation)

export interface Play {
  // Identity
  id: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  type: PlayType;

  // The cast
  agents: Agent[];
  agentRelationships: AgentRelationship[];

  // User's role in this play
  userRole: UserRole;
  userRelationshipDefault: UserRelationshipType;

  // World
  worldState: WorldState;
  worldRules: WorldRules;

  // Idle mechanics
  idleBehavior: IdleBehavior;

  // How interaction works
  interactionModes: InteractionMode[];

  // Proactive triggers
  triggers: TriggerDefinition[];

  // What agents can access
  toolPermissions: ToolPermissions;

  // Channels this play supports
  channels: PlayChannels;

  // Orchestrator: decides which agent speaks, synthesizes perspectives
  orchestrator: OrchestratorConfig;

  // FTUE: First Time User Experience flow
  ftue: FTUEFlow;
}

// =============================================================================
// Agents
// =============================================================================

export interface Agent {
  id: string;
  name: string;
  emoji?: string;
  role: string;
  description: string;

  // The core prompt that defines this agent
  systemPrompt: string;

  // Orchestrator properties: when this agent should speak
  strength: AgentStrength;       // When this agent shines
  voiceStyle: string;            // How they speak: "warm", "energetic", "thoughtful"

  // Personality traits
  personality: AgentPersonality;

  // What this agent knows (game-specific)
  knowledge?: AgentKnowledge;

  // Voice and communication style
  voice: AgentVoice;

  // What tools this agent can use
  tools: AgentTool[];

  // When this agent should speak up
  speaksWhen: string[];

  // Initial relationship with user
  initialUserRelationship?: UserRelationshipType;
}

export interface AgentPersonality {
  traits: string[];           // e.g., "warm", "analytical", "secretive"
  strengths: string[];        // What they're good at
  weaknesses?: string[];      // What they struggle with (for games)
  quirks?: string[];          // Distinctive behaviors
  values: string[];           // What they care about
}

export interface AgentKnowledge {
  // What this agent knows (public)
  publicKnowledge: string[];

  // What this agent knows (hidden from user, for games)
  hiddenKnowledge?: string[];

  // What this agent is hiding (for mystery games)
  secrets?: string[];

  // What this agent believes (may be wrong)
  beliefs?: string[];
}

export interface AgentVoice {
  tone: string;               // e.g., "warm and gentle", "direct and honest"
  vocabulary: string;         // e.g., "simple", "academic", "casual"
  patterns: string[];         // Speech patterns, phrases they use
  examples: string[];         // Example utterances
}

export type AgentTool =
  | 'memory'           // Access to conversation history, facts, patterns
  | 'tasks'            // Read/create tasks
  | 'calendar'         // Read/create calendar events
  | 'email_read'       // Read user's inbox
  | 'email_draft'      // Draft emails in user's account
  | 'email_send'       // Send as agent (proactive outreach)
  | 'patterns'         // Access to detected patterns about user
  | 'triggers'         // Create/manage proactive triggers
  | 'idle_thoughts'    // Generate idle thoughts
  | 'celebration'      // Track and celebrate wins
  | 'world_state'      // Read/modify world state (for games)
  | 'other_agents';    // Communicate with other agents

// =============================================================================
// Agent Relationships
// =============================================================================

export interface AgentRelationship {
  agentA: string;              // Agent ID
  agentB: string;              // Agent ID
  type: AgentRelationshipType;
  strength: number;            // 0-1, how strong the relationship is
  description: string;         // e.g., "Luna and Sage often collaborate on planning"
  dynamics?: string[];         // e.g., "Luna defers to Sage on strategy"

  // For games: hidden aspects of relationship
  hiddenDynamics?: string[];
}

export type AgentRelationshipType =
  | 'collaborative'    // Work together
  | 'supportive'       // One supports the other
  | 'tense'            // Underlying tension
  | 'conflicting'      // Open conflict
  | 'romantic'         // Romantic connection (for simulations)
  | 'familial'         // Family relationship
  | 'professional'     // Work relationship
  | 'secret'           // Hidden relationship (for games)
  | 'neutral';         // No strong relationship

// =============================================================================
// User Relationships
// =============================================================================

export interface UserRelationship {
  agentId: string;
  type: UserRelationshipType;
  trust: number;              // 0-1, how much agent trusts user
  familiarity: number;        // 0-1, how well they know each other
  affection: number;          // 0-1, how much agent cares about user
  history: string[];          // Key moments in relationship
}

export type UserRelationshipType =
  | 'supportive'       // Agent supports user (Companion)
  | 'friendly'         // Friendly NPC (Game)
  | 'suspicious'       // Suspicious of user (Mystery)
  | 'deceptive'        // Actively hiding things (Mystery)
  | 'professional'     // Business relationship
  | 'observed'         // User observes, no direct relationship (Simulation)
  | 'adversarial';     // Opposed to user (Game)

// =============================================================================
// World State
// =============================================================================

export interface WorldState {
  // Current state
  phase: string;              // e.g., "act_1", "morning", "investigation"
  day: number;                // Days since start
  time: TimeOfDay;

  // Events that have happened
  events: WorldEvent[];

  // For games: progress tracking
  progress?: GameProgress;

  // Custom state (Play-specific)
  custom: Record<string, unknown>;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface WorldEvent {
  id: string;
  timestamp: Date;
  type: string;
  description: string;
  involvedAgents: string[];
  visible: boolean;           // Whether user can see this event
  consequences?: string[];
}

export interface GameProgress {
  discovered: string[];       // What user has discovered
  undiscovered: string[];     // What's still hidden
  milestones: string[];       // Key progress points
  endings?: string[];         // Possible endings reached
}

// =============================================================================
// World Rules
// =============================================================================

export interface WorldRules {
  // How time passes
  timeProgression: 'real_time' | 'session_based' | 'manual' | 'event_driven';

  // How agents interact with each other
  agentInteraction: 'collaborative' | 'independent' | 'competitive' | 'mixed';

  // How user interacts with agents
  userInteraction: 'direct' | 'mediated' | 'observation' | 'mixed';

  // Can agents lie to user?
  agentsCanLie: boolean;

  // Can agents hide information?
  agentsCanHide: boolean;

  // Do agents have hidden agendas?
  agentsHaveAgendas: boolean;

  // Is there a win/lose condition?
  hasWinCondition: boolean;
  winCondition?: string;
  loseCondition?: string;

  // Custom rules (Play-specific)
  custom: Record<string, unknown>;
}

// =============================================================================
// Idle Behavior
// =============================================================================

export interface IdleBehavior {
  // Is idle behavior enabled?
  enabled: boolean;

  // What happens when user is away
  awayBehavior: AwayBehavior;

  // How often to generate idle content (minutes)
  tickIntervalMinutes: number;

  // What to generate during idle
  generates: IdleContentType[];

  // Reunion behavior (when user returns)
  reunionBehavior: ReunionBehavior;
}

export interface AwayBehavior {
  // Do agents think about user?
  thinkAboutUser: boolean;

  // Do agents discuss user with each other?
  discussUser: boolean;

  // Do agents continue their own activities?
  continueActivities: boolean;

  // Do agents advance the world/plot?
  advanceWorld: boolean;

  // Custom away behaviors
  custom?: string[];
}

export type IdleContentType =
  | 'reflection'       // Agent reflects on user
  | 'observation'      // Agent notices something about user
  | 'question'         // Agent forms a question to ask
  | 'memory'           // Agent recalls a memory
  | 'concern'          // Agent worries about user
  | 'celebration'      // Agent celebrates user's progress
  | 'idea'             // Agent has an idea
  | 'discussion'       // Agents discuss with each other
  | 'world_event'      // Something happens in the world
  | 'plot_advance';    // Story/plot advances

export interface ReunionBehavior {
  // Should agents greet user on return?
  greetOnReturn: boolean;

  // Should agents share what accumulated?
  shareAccumulated: boolean;

  // Minimum away time to trigger reunion (minutes)
  minAwayMinutes: number;

  // How to format the reunion
  format: 'summary' | 'conversation' | 'notification' | 'mixed';

  // Which agent leads the reunion?
  leadAgent?: string;  // Or 'rotate', 'context_based'
}

// =============================================================================
// Interaction Modes
// =============================================================================

export type InteractionMode =
  | 'direct_chat'      // User chats with one agent
  | 'group_chat'       // User chats with multiple agents
  | 'observation'      // User observes agents interact
  | 'discussion'       // Agents discuss, user can interject
  | 'interrogation'    // User questions agent (for games)
  | 'notification'     // Agents send proactive messages
  | 'check_in';        // Scheduled check-ins

// =============================================================================
// Triggers
// =============================================================================

export interface TriggerDefinition {
  id: string;
  name: string;
  description: string;

  // When to trigger
  condition: TriggerCondition;

  // What to do when triggered
  action: TriggerAction;

  // Which agent(s) involved
  agents: string[] | 'all' | 'context_based';

  // Cooldown and limits
  cooldownMinutes: number;
  maxPerDay: number;

  // Is this enabled by default?
  enabled: boolean;
}

export interface TriggerCondition {
  type: 'scheduled' | 'pattern' | 'event' | 'inactivity' | 'world_state' | 'compound';

  // For scheduled
  schedule?: {
    hour?: number;
    minute?: number;
    daysOfWeek?: number[];
  };

  // For pattern
  pattern?: {
    patternType: string;
    minConfidence?: number;
  };

  // For event
  event?: {
    eventType: string;
    eventData?: Record<string, unknown>;
  };

  // For inactivity
  inactivity?: {
    minutes: number;
  };

  // For world state
  worldState?: {
    condition: string;  // Expression to evaluate
  };

  // For compound
  compound?: {
    operator: 'AND' | 'OR';
    conditions: TriggerCondition[];
  };
}

export interface TriggerAction {
  type: 'message' | 'check_in' | 'nudge' | 'celebrate' | 'reflect' | 'world_event' | 'custom';

  // Configuration
  config: Record<string, unknown>;
}

// =============================================================================
// Tool Permissions
// =============================================================================

export interface ToolPermissions {
  // Global permissions (apply to all agents unless overridden)
  global: AgentTool[];

  // Per-agent overrides
  agentOverrides?: Record<string, {
    add?: AgentTool[];
    remove?: AgentTool[];
  }>;
}

// =============================================================================
// Channels
// =============================================================================

export interface PlayChannels {
  telegram?: {
    botTokenEnvVar: string;
    botUsername?: string;
  };
  whatsapp?: {
    enabled: boolean;
    messagePrefix?: string;
  };
  email?: {
    enabled: boolean;
    fromNamePrefix?: string;
  };
  web?: {
    enabled: boolean;
  };
}

// =============================================================================
// Play Instance (Runtime)
// =============================================================================

export interface PlayInstance {
  play: Play;
  userId: string;

  // Runtime state
  worldState: WorldState;
  userRelationships: UserRelationship[];

  // Session tracking
  lastSeen: Date;
  sessionCount: number;

  // Accumulated idle content
  accumulatedContent: AccumulatedContent[];
}

export interface AccumulatedContent {
  id: string;
  timestamp: Date;
  agentId: string;
  type: IdleContentType;
  content: string;
  shared: boolean;
}
