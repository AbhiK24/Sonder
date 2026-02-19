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

// =============================================================================
// Play Definition
// =============================================================================

export const CHORUS_PLAY = {
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
  `,
  version: '0.1.0',
  agents: agentList,
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
