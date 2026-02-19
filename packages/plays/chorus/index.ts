/**
 * Chorus
 *
 * Five voices harmonizing to support your ADHD brain.
 *
 * "They're not assistants. They're angels rooting for you."
 *
 * The Ensemble:
 * - Luna (The Keeper)  → Remembers everything so you don't have to
 * - Ember (The Spark)  → Gets you started when starting feels impossible
 * - Sage (The Guide)   → Helps you navigate when you can't see the path
 * - Joy (The Light)    → Sees your wins when you can't see them yourself
 * - Echo (The Mirror)  → Reflects what you're feeling so you can see clearly
 */

// Types
export * from './types.js';

// Agents
export * from './agents/index.js';

import {
  agents,
  agentList,
  selectAgent,
  selectDiscussionParticipants,
  getCheckInLead,
} from './agents/index.js';
import type {
  ChorusAgent,
  ChorusAgentId,
  ChorusDiscussion,
  ProactiveCheckIn,
  AgentTool,
} from './types.js';
import type {
  Play,
  Agent,
  PlayCapabilities,
} from '../../engine/src/plays/types.js';
import { getDefaultCapabilities } from '../../engine/src/plays/types.js';
import { chorusOrchestratorConfig } from '../../engine/src/plays/chorus/orchestrator.js';
import { chorusFTUE } from '../../engine/src/plays/chorus/ftue.js';

// =============================================================================
// Play Definition (Full Play interface)
// =============================================================================

/**
 * Convert ChorusAgent to engine Agent format
 */
function toEngineAgent(agent: ChorusAgent): Agent {
  return {
    id: agent.id,
    name: agent.name,
    emoji: agent.emoji,
    role: agent.role,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    personality: {
      traits: agent.voiceTraits,
      strengths: agent.strengths,
      values: ['supporting the user', 'gentle accountability', 'celebrating growth'],
    },
    voice: {
      tone: agent.voiceTraits[0] || 'warm and supportive',
      vocabulary: 'accessible, warm, non-clinical',
      patterns: agent.voiceTraits,
      examples: [],
    },
    tools: agent.preferredTools,
    speaksWhen: agent.speaksWhen,
    initialUserRelationship: 'supportive',
  };
}

export const CHORUS_PLAY: Play = {
  id: 'chorus',
  name: 'Chorus',
  tagline: 'Five voices harmonizing to support your ADHD brain',
  description: `
    Chorus is an ensemble of five AI companions designed specifically for ADHD minds.
    They're not productivity tools. They're not task managers. They're angels who:

    - REMEMBER what you forget (Luna)
    - SPARK when you're stuck (Ember)
    - GUIDE when you're lost (Sage)
    - CELEBRATE when you dismiss your wins (Joy)
    - REFLECT when emotions overwhelm (Echo)

    They discuss you with each other. They notice patterns you can't see.
    They reach out when you need them. They're rooting for you.
  `.trim(),
  version: '0.1.0',
  archetype: 'support_crew',

  // Cast
  agents: agentList.map(toEngineAgent),
  agentRelationships: [
    {
      agentA: 'luna',
      agentB: 'sage',
      type: 'collaborative',
      strength: 0.9,
      description: 'Luna remembers, Sage plans. They work closely together.',
      dynamics: ['Luna feeds context to Sage', 'Sage helps Luna prioritize what to surface'],
    },
    {
      agentA: 'ember',
      agentB: 'joy',
      type: 'supportive',
      strength: 0.8,
      description: 'Ember gets things started, Joy celebrates completion.',
      dynamics: ['They form the action-celebration loop'],
    },
    {
      agentA: 'echo',
      agentB: 'luna',
      type: 'collaborative',
      strength: 0.7,
      description: 'Echo reflects emotions, Luna provides context for patterns.',
      dynamics: ['Luna helps Echo understand recurring emotional themes'],
    },
    {
      agentA: 'sage',
      agentB: 'ember',
      type: 'collaborative',
      strength: 0.7,
      description: 'Sage plans the path, Ember provides the spark to start.',
      dynamics: ['Sage breaks down tasks, Ember makes them feel doable'],
    },
    {
      agentA: 'joy',
      agentB: 'echo',
      type: 'supportive',
      strength: 0.6,
      description: 'Joy balances Echo\'s introspection with celebration.',
      dynamics: ['Joy helps reframe difficult emotions Echo surfaces'],
    },
  ],

  // User role
  userRole: 'subject',
  userRelationshipDefault: 'supportive',

  // World (minimal for companion play)
  worldState: {
    phase: 'ongoing',
    day: 0,
    time: 'morning',
    events: [],
    custom: {},
  },

  worldRules: {
    timeProgression: 'real_time',
    agentInteraction: 'collaborative',
    userInteraction: 'direct',
    agentsCanLie: false,
    agentsCanHide: false,
    agentsHaveAgendas: false,
    hasWinCondition: false,
    custom: {
      alwaysRootingForUser: true,
      celebrateSmallWins: true,
    },
  },

  // Idle mechanics (core to Chorus)
  idleBehavior: {
    enabled: true,
    awayBehavior: {
      thinkAboutUser: true,
      discussUser: true,
      continueActivities: false,
      advanceWorld: false,
      custom: [
        'Notice patterns in recent conversations',
        'Prepare gentle reminders',
        'Think about what user might need when they return',
      ],
    },
    tickIntervalMinutes: 30,
    generates: ['reflection', 'observation', 'question', 'concern', 'celebration', 'discussion'],
    reunionBehavior: {
      greetOnReturn: true,
      shareAccumulated: true,
      minAwayMinutes: 60,
      format: 'conversation',
      leadAgent: 'luna',
    },
  },

  // How interaction works
  interactionModes: ['direct_chat', 'group_chat', 'discussion', 'notification', 'check_in'],

  // Proactive triggers
  triggers: [
    {
      id: 'morning-checkin',
      name: 'Morning Check-in',
      description: 'Luna leads a morning planning session',
      condition: { type: 'scheduled', schedule: { hour: 9, minute: 0 } },
      action: { type: 'check_in', config: { checkInType: 'morning' } },
      agents: ['luna', 'sage'],
      cooldownMinutes: 60 * 20, // Once per day
      maxPerDay: 1,
      enabled: true,
    },
    {
      id: 'midday-nudge',
      name: 'Midday Energy Check',
      description: 'Ember checks in on momentum',
      condition: { type: 'scheduled', schedule: { hour: 13, minute: 0 } },
      action: { type: 'nudge', config: { nudgeType: 'momentum' } },
      agents: ['ember', 'joy'],
      cooldownMinutes: 60 * 20,
      maxPerDay: 1,
      enabled: true,
    },
    {
      id: 'evening-reflection',
      name: 'Evening Reflection',
      description: 'Joy leads evening win celebration',
      condition: { type: 'scheduled', schedule: { hour: 19, minute: 0 } },
      action: { type: 'reflect', config: { reflectType: 'wins' } },
      agents: ['joy', 'echo'],
      cooldownMinutes: 60 * 20,
      maxPerDay: 1,
      enabled: true,
    },
    {
      id: 'inactivity-checkin',
      name: 'Gentle Inactivity Check',
      description: 'Check in if user has been quiet for a while',
      condition: { type: 'inactivity', inactivity: { minutes: 180 } },
      action: { type: 'message', config: { tone: 'gentle', notIntrusive: true } },
      agents: 'context_based',
      cooldownMinutes: 60 * 6, // Max once per 6 hours
      maxPerDay: 2,
      enabled: true,
    },
    {
      id: 'celebration-trigger',
      name: 'Win Celebration',
      description: 'Celebrate when user completes something',
      condition: { type: 'event', event: { eventType: 'task_completed' } },
      action: { type: 'celebrate', config: {} },
      agents: ['joy'],
      cooldownMinutes: 15,
      maxPerDay: 10,
      enabled: true,
    },
  ],

  // Tool permissions
  toolPermissions: {
    global: ['memory', 'patterns', 'other_agents'],
    agentOverrides: {
      luna: { add: ['tasks', 'calendar', 'triggers'] },
      ember: { add: ['tasks', 'idle_thoughts', 'triggers'] },
      sage: { add: ['tasks', 'calendar'] },
      joy: { add: ['celebration', 'tasks'] },
      echo: { add: ['triggers'] },
    },
  },

  // Channels
  channels: {
    telegram: {
      botTokenEnvVar: 'CHORUS_TELEGRAM_BOT_TOKEN',
      botUsername: '@ChorusBot',
    },
    whatsapp: {
      enabled: true,
      messagePrefix: '✨',
    },
    email: {
      enabled: true,
      fromNamePrefix: 'Chorus',
    },
    web: {
      enabled: true,
    },
  },

  // Orchestrator - who speaks when
  orchestrator: chorusOrchestratorConfig,

  // FTUE - first time user experience
  ftue: chorusFTUE,

  // Capabilities - what engine features this play uses
  capabilities: {
    ...getDefaultCapabilities('support_crew'),
    // All support_crew defaults are good for Chorus
  },
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get an agent by ID
 */
export function getAgent(id: ChorusAgentId): ChorusAgent {
  return agents[id];
}

/**
 * Get all agents
 */
export function getAllAgents(): ChorusAgent[] {
  return agentList;
}

/**
 * Get the system prompt for an agent
 */
export function getAgentPrompt(id: ChorusAgentId): string {
  return agents[id].systemPrompt;
}

/**
 * Select the best agent for a situation
 */
export { selectAgent, selectDiscussionParticipants, getCheckInLead };

// =============================================================================
// Tool Permissions
// =============================================================================

/**
 * Get tools available to an agent
 */
export function getAgentTools(id: ChorusAgentId): AgentTool[] {
  return agents[id].preferredTools;
}

/**
 * Check if an agent can use a specific tool
 */
export function canUseTool(agentId: ChorusAgentId, tool: AgentTool): boolean {
  return agents[agentId].preferredTools.includes(tool);
}

/**
 * Get all agents who can use a specific tool
 */
export function getAgentsWithTool(tool: AgentTool): ChorusAgent[] {
  return agentList.filter(agent => agent.preferredTools.includes(tool));
}

// =============================================================================
// Discussion Generation
// =============================================================================

/**
 * Generate a discussion topic for the agents
 */
export function generateDiscussionTopic(context: {
  recentEvents?: string[];
  patterns?: string[];
  concerns?: string[];
}): string {
  const { recentEvents, patterns, concerns } = context;

  // Prioritize concerns
  if (concerns && concerns.length > 0) {
    return `We should discuss: ${concerns[0]}`;
  }

  // Then patterns
  if (patterns && patterns.length > 0) {
    return `I've noticed a pattern: ${patterns[0]}. What do you all think?`;
  }

  // Then recent events
  if (recentEvents && recentEvents.length > 0) {
    return `Something happened recently: ${recentEvents[0]}. How should we support them?`;
  }

  // Default
  return 'How has our person been doing lately? What should we focus on?';
}

// =============================================================================
// Proactive Check-in Templates
// =============================================================================

export const checkInTemplates: Record<
  'morning' | 'midday' | 'evening' | 'weekly',
  {
    lead: ChorusAgentId;
    supporting: ChorusAgentId[];
    promptHints: string[];
  }
> = {
  morning: {
    lead: 'luna',
    supporting: ['sage'],
    promptHints: [
      "What's on the plate today?",
      'Any important things from yesterday carrying over?',
      "What's the ONE thing that would make today feel successful?",
    ],
  },
  midday: {
    lead: 'ember',
    supporting: ['joy'],
    promptHints: [
      "How's momentum? Need help starting something?",
      'Quick win check: anything to celebrate from this morning?',
      "If you're stuck, what's the tiniest next step?",
    ],
  },
  evening: {
    lead: 'joy',
    supporting: ['echo'],
    promptHints: [
      "What went well today? Even small things count.",
      "How are you feeling about the day?",
      "Anything you're proud of, even if it feels small?",
    ],
  },
  weekly: {
    lead: 'sage',
    supporting: ['luna', 'joy'],
    promptHints: [
      'Big picture: how was this week overall?',
      "What patterns are emerging? What's working, what isn't?",
      'Looking ahead: what matters most next week?',
    ],
  },
};

// =============================================================================
// Ensemble Intro (for new users)
// =============================================================================

export const ensembleIntro = `
Welcome to Chorus.

We're five voices here to support you — not to manage you, judge you, or fix you.

🌙 **Luna** (The Keeper) — I remember everything so you don't have to.
🔥 **Ember** (The Spark) — I help you start when starting feels impossible.
🌿 **Sage** (The Guide) — I help you see the path when everything's overwhelming.
✨ **Joy** (The Light) — I see your wins, even the ones you dismiss.
🪞 **Echo** (The Mirror) — I reflect what you're feeling so you can see clearly.

We talk to each other about you. We notice patterns. We're rooting for you.

You're not alone in this. We're your chorus.
`.trim();
