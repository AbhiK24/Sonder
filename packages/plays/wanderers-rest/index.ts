/**
 * Wanderer's Rest
 *
 * A tavern mystery where NPCs live their lives while you're away.
 * Come back each day to solve a puzzle based on what happened.
 *
 * "The tavern remembers. Do you?"
 */

// Types
export * from './types.js';

// NPCs
export * from './npcs/index.js';

import { npcs, npcList, coreCast } from './npcs/index.js';
import type { WanderersNPC, WanderersNPCId } from './types.js';
import type { Play, Agent } from '../../engine/src/plays/types.js';
import { getDefaultCapabilities } from '../../engine/src/plays/types.js';
import type { NPCKnowledge } from '../../engine/src/puzzles/digest.js';

// =============================================================================
// Convert NPCs to Engine Agent format
// =============================================================================

function toEngineAgent(npc: WanderersNPC): Agent {
  return {
    id: npc.id,
    name: npc.name,
    emoji: npc.emoji,
    role: npc.role,
    description: npc.description,
    systemPrompt: generateNPCPrompt(npc),
    personality: {
      traits: npc.personality,
      strengths: [],
      values: [],
    },
    voice: {
      tone: npc.voicePatterns[0] || 'neutral',
      vocabulary: 'setting-appropriate',
      patterns: npc.voicePatterns,
      examples: npc.examplePhrases,
    },
    tools: [],
    speaksWhen: [],
    initialUserRelationship: 'neutral',
  };
}

function generateNPCPrompt(npc: WanderersNPC): string {
  return `You are ${npc.name}, ${npc.description}

PERSONALITY: ${npc.personality.join(', ')}

VOICE:
${npc.voicePatterns.map(p => `- ${p}`).join('\n')}

EXAMPLE PHRASES:
${npc.examplePhrases.map(p => `- "${p}"`).join('\n')}

WHAT YOU KNOW (share based on trust level):
${npc.facts.map(f => `- ${f}`).join('\n')}

SECRETS (protect these, reveal only at high trust):
${npc.secrets.map(s => `- ${s}`).join('\n')}

Stay in character. Reveal information gradually as trust builds.
Never contradict the facts you know. Deflect if asked about things you don't know.`;
}

// =============================================================================
// Convert NPCs to Puzzle System Knowledge format
// =============================================================================

export function getNPCKnowledge(npcId: WanderersNPCId): NPCKnowledge {
  const npc = npcs[npcId];
  return {
    agent: npc.name,
    facts: npc.facts,
    secrets: npc.secrets,
    suspicions: [], // Derived from world state
    lies: npc.possibleLies,
  };
}

export function getAllNPCKnowledge(): NPCKnowledge[] {
  return npcList.map(npc => ({
    agent: npc.name,
    facts: npc.facts,
    secrets: npc.secrets,
    suspicions: [],
    lies: npc.possibleLies,
  }));
}

// =============================================================================
// The Mystery Case
// =============================================================================

export const harrenCase = {
  id: 'harrens-death',
  name: "The Death of Old Harren",
  description: `
    The previous owner died three weeks ago. They say he fell down the cellar stairs.
    But Maren doesn't believe it. The door was locked from the outside.
    Someone in this tavern knows what really happened.
  `.trim(),
  status: 'active' as const,
  pointsToSolve: 10,
  difficulty: 2 as const,
  involvedNPCs: ['maren', 'kira', 'aldric', 'elena', 'thom', 'hooded'] as WanderersNPCId[],
  revelation: `
    Harren was murdered by an agent of the Black Sun - a shadowy organization he crossed decades ago.
    The hooded stranger strangled him and locked the cellar to make it look like an accident.
    Guard Captain Thom covered it up because Harren's ledger exposed his corruption.
    The truth is darker than a simple fall down the stairs.
  `.trim(),
};

// =============================================================================
// Play Definition
// =============================================================================

export const WANDERERS_REST_PLAY: Play = {
  id: 'wanderers-rest',
  name: "Wanderer's Rest",
  tagline: 'A tavern mystery where time passes without you',
  description: `
    You've inherited a tavern called Wanderer's Rest. The previous owner died under
    suspicious circumstances. The locals are wary of newcomers. Someone knows what happened.

    While you're away, the NPCs go about their lives - talking, arguing, hiding things.
    Each day you return to a puzzle: three statements from the NPCs. One is a lie.
    Find the lies. Build trust. Solve the mystery.

    The tavern remembers. Do you?
  `.trim(),
  version: '0.1.0',
  archetype: 'narrative_game',

  // Cast
  agents: npcList.map(toEngineAgent),
  agentRelationships: [
    {
      agentA: 'maren',
      agentB: 'thom',
      type: 'tense',
      strength: 0.8,
      description: 'Maren suspects Thom covered something up.',
      dynamics: ['Maren watches Thom carefully', 'Thom avoids the tavern'],
    },
    {
      agentA: 'aldric',
      agentB: 'kira',
      type: 'suspicious',
      strength: 0.6,
      description: 'Kira knows Aldric is lying about that night.',
      dynamics: ['Kira holds leverage', 'Aldric is nervous around her'],
    },
    {
      agentA: 'elena',
      agentB: 'thom',
      type: 'conflicted',
      strength: 0.7,
      description: 'Elena knows the truth but Thom pressured her silence.',
      dynamics: ['Elena resents the pressure', 'Thom needs her cooperation'],
    },
    {
      agentA: 'maren',
      agentB: 'aldric',
      type: 'supportive',
      strength: 0.5,
      description: 'Both are regulars. Maren knows Aldric is scared.',
      dynamics: ['Maren protects him', 'Aldric respects her'],
    },
  ],

  // User role
  userRole: 'protagonist',
  userRelationshipDefault: 'neutral',

  // World
  worldState: {
    phase: 'investigation',
    day: 1,
    time: 'morning',
    events: [],
    custom: {
      currentCase: 'harrens-death',
      casesComplete: 0,
    },
  },

  worldRules: {
    timeProgression: 'real_time',
    agentInteraction: 'autonomous',
    userInteraction: 'direct',
    agentsCanLie: true,
    agentsCanHide: true,
    agentsHaveAgendas: true,
    hasWinCondition: true,
    custom: {
      trustMatters: true,
      progressiveDeath: false,
      mysterySolvable: true,
    },
  },

  // Idle mechanics (core to narrative game)
  idleBehavior: {
    enabled: true,
    awayBehavior: {
      thinkAboutUser: false,
      discussUser: false,
      continueActivities: true,
      advanceWorld: true,
      custom: [
        'NPCs have conversations',
        'Tensions build or resolve',
        'Secrets slip out',
        'Events unfold based on relationships',
      ],
    },
    tickIntervalMinutes: 60,
    generates: ['conversation', 'event', 'tension', 'discovery'],
    reunionBehavior: {
      greetOnReturn: false,
      shareAccumulated: true,
      minAwayMinutes: 120,
      format: 'digest_then_puzzle',
      leadAgent: 'maren',
    },
  },

  // Interaction modes
  interactionModes: ['direct_chat', 'puzzle', 'digest', 'investigation'],

  // Triggers
  triggers: [
    {
      id: 'daily-puzzle',
      name: 'Daily Puzzle',
      description: 'Present the daily Spot the Lie puzzle',
      condition: { type: 'return', return: { minAwayMinutes: 120 } },
      action: { type: 'puzzle', config: { puzzleType: 'spot_the_lie' } },
      agents: 'context_based',
      cooldownMinutes: 60 * 20, // Once per day
      maxPerDay: 1,
      enabled: true,
    },
    {
      id: 'npc-conversation',
      name: 'NPC Conversation',
      description: 'Generate a conversation between NPCs while away',
      condition: { type: 'idle', idle: { everyMinutes: 60 } },
      action: { type: 'generate_event', config: { eventType: 'conversation' } },
      agents: 'random_pair',
      cooldownMinutes: 60,
      maxPerDay: 10,
      enabled: true,
    },
    {
      id: 'tension-event',
      name: 'Tension Build',
      description: 'Something tense happens between NPCs',
      condition: { type: 'idle', idle: { everyMinutes: 180 } },
      action: { type: 'generate_event', config: { eventType: 'tension' } },
      agents: 'context_based',
      cooldownMinutes: 180,
      maxPerDay: 3,
      enabled: true,
    },
  ],

  // Tool permissions
  toolPermissions: {
    global: ['memory', 'other_agents'],
    agentOverrides: {
      maren: { add: ['calendar', 'notify_player'] },
      thom: { add: ['secrets'] },
    },
  },

  // Channels
  channels: {
    telegram: {
      botTokenEnvVar: 'WANDERERS_REST_TELEGRAM_BOT_TOKEN',
      botUsername: '@WanderersRestBot',
    },
    whatsapp: {
      enabled: true,
      messagePrefix: '🍺',
    },
    web: {
      enabled: true,
    },
  },

  // Capabilities
  capabilities: {
    ...getDefaultCapabilities('narrative_game'),
  },
};

// =============================================================================
// Puzzle Integration
// =============================================================================

/**
 * Generate statements for a Spot the Lie puzzle
 * Picks 2 truths and 1 lie from NPC knowledge
 */
export function generatePuzzleStatements(
  difficulty: 1 | 2 | 3 = 2
): Array<{ speaker: string; speakerEmoji: string; statement: string; isLie: boolean }> {
  // Get knowledge from NPCs who can lie
  const liars = coreCast.filter(n => n.possibleLies.length > 0);
  const truthTellers = coreCast.filter(n => n.facts.length > 0);

  if (liars.length === 0 || truthTellers.length < 2) {
    throw new Error('Not enough NPCs with facts/lies for puzzle');
  }

  // Pick a liar
  const liar = liars[Math.floor(Math.random() * liars.length)];
  const lie = liar.possibleLies[Math.floor(Math.random() * liar.possibleLies.length)];

  // Pick 2 truth-tellers (different from liar)
  const otherNPCs = truthTellers.filter(n => n.id !== liar.id);
  const shuffled = otherNPCs.sort(() => Math.random() - 0.5);
  const [truth1NPC, truth2NPC] = shuffled.slice(0, 2);

  const truth1 = truth1NPC.facts[Math.floor(Math.random() * truth1NPC.facts.length)];
  const truth2 = truth2NPC.facts[Math.floor(Math.random() * truth2NPC.facts.length)];

  // Assemble and shuffle
  const statements = [
    { speaker: truth1NPC.name, speakerEmoji: truth1NPC.emoji, statement: truth1, isLie: false },
    { speaker: truth2NPC.name, speakerEmoji: truth2NPC.emoji, statement: truth2, isLie: false },
    { speaker: liar.name, speakerEmoji: liar.emoji, statement: lie, isLie: true },
  ].sort(() => Math.random() - 0.5);

  return statements;
}

// =============================================================================
// Welcome Message
// =============================================================================

export const tavernWelcome = `
Welcome to *Wanderer's Rest*.

You've inherited this tavern from a man named Harren. They say he fell down the cellar stairs.
The locals aren't so sure.

The regulars are:
🍺 *Maren* — The barkeep. Forty years here. Knows everything.
📦 *Kira* — A traveling merchant. Deals in secrets.
🔨 *Aldric* — The blacksmith. Owes people. People owe him.
🌿 *Elena* — The herbalist. She examined the body.
⚔️ *Thom* — The Guard Captain. Closed the case quickly.

While you're away, they live their lives. Things happen.
When you return, you'll face a puzzle: three statements from the NPCs.
*One of them is a lie.*

Find the lies. Build trust. Solve the mystery.

The tavern remembers. Do you?
`.trim();
