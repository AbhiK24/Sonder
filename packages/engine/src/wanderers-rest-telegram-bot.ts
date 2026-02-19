#!/usr/bin/env node
/**
 * Wanderer's Rest Telegram Bot
 *
 * A tavern mystery where NPCs live while you're away.
 * Daily puzzles: Spot the Lie.
 *
 * Run: pnpm wanderers-rest
 */

import { Bot } from 'grammy';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createProvider } from './llm/providers.js';
import {
  PuzzleEngine,
  PuzzleFormatter,
  DigestGenerator,
  StoryGenerator,
  type Puzzle,
  type CaseProgress,
  type DailyDigest,
} from './puzzles/index.js';
import { Persistence } from './utils/persistence.js';
import type { ModelConfig, LLMProvider } from './types/index.js';

// Wanderer's Rest play imports
import {
  npcs,
  npcList,
  coreCast,
  harrenCase,
  tavernWelcome,
  generatePuzzleStatements,
  getAllNPCKnowledge,
} from '../../plays/wanderers-rest/index.js';
import type { WanderersNPC, WanderersNPCId } from '../../plays/wanderers-rest/types.js';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  minAwayForDigest: 60, // minutes before showing "what happened while away"
  puzzlePointsToSolve: 10,
};

// =============================================================================
// Types
// =============================================================================

interface UserState {
  id: number;
  lastSeen: Date;
  sessionCount: number;
  isNewUser: boolean;

  // Case progress
  caseProgress: CaseProgress;

  // Today's puzzle
  currentPuzzle?: Puzzle;
  pendingDigest?: DailyDigest;

  // Conversation history with NPCs
  history: Array<{
    role: 'user' | 'npc';
    npcId?: WanderersNPCId;
    content: string;
    timestamp: Date;
  }>;

  // Trust levels
  trust: Record<WanderersNPCId, number>;

  // Current NPC talking to
  talkingTo?: WanderersNPCId;
}

// =============================================================================
// State
// =============================================================================

const userStates = new Map<number, UserState>();

// Services
let provider: LLMProvider;
let puzzleEngine: PuzzleEngine;
let puzzleFormatter: PuzzleFormatter;
let digestGenerator: DigestGenerator;
let storyGenerator: StoryGenerator;
let bot: Bot;

// Persistence
const saveDir = process.env.SAVE_PATH?.replace('~', process.env.HOME || '') ||
  resolve(process.env.HOME || '', '.sonder/saves/wanderers-rest');
const persistence = new Persistence(saveDir);

// =============================================================================
// User State Management
// =============================================================================

interface SavedWanderersState {
  lastSeen: string;
  sessionCount: number;
  caseProgress: CaseProgress;
  currentPuzzle?: Puzzle;
  history: UserState['history'];
  trust: Record<WanderersNPCId, number>;
  talkingTo?: WanderersNPCId;
}

function getState(chatId: number): UserState {
  if (!userStates.has(chatId)) {
    const saved = persistence.load<SavedWanderersState>(chatId);

    if (saved) {
      userStates.set(chatId, {
        id: chatId,
        lastSeen: new Date(saved.lastSeen),
        sessionCount: saved.sessionCount || 1,
        isNewUser: false,
        caseProgress: saved.caseProgress || puzzleEngine.createCaseProgress(
          harrenCase.id,
          harrenCase.name
        ),
        currentPuzzle: saved.currentPuzzle,
        history: saved.history || [],
        trust: saved.trust || initTrust(),
        talkingTo: saved.talkingTo,
      });
      console.log(`[${chatId}] Loaded save (session ${saved.sessionCount})`);
    } else {
      userStates.set(chatId, {
        id: chatId,
        lastSeen: new Date(),
        sessionCount: 1,
        isNewUser: true,
        caseProgress: puzzleEngine.createCaseProgress(harrenCase.id, harrenCase.name),
        history: [],
        trust: initTrust(),
      });
      console.log(`[${chatId}] New user`);
    }
  }

  return userStates.get(chatId)!;
}

function initTrust(): Record<WanderersNPCId, number> {
  const trust: Record<string, number> = {};
  for (const npc of npcList) {
    trust[npc.id] = 30; // Start at 30 trust
  }
  return trust as Record<WanderersNPCId, number>;
}

function saveState(chatId: number): void {
  const state = userStates.get(chatId);
  if (!state) return;

  const saveData: SavedWanderersState = {
    lastSeen: state.lastSeen.toISOString(),
    sessionCount: state.sessionCount,
    caseProgress: state.caseProgress,
    currentPuzzle: state.currentPuzzle,
    history: state.history.slice(-100),
    trust: state.trust,
    talkingTo: state.talkingTo,
  };

  persistence.save(chatId, saveData as unknown as Partial<import('./utils/persistence.js').SavedChatState>);
}

// =============================================================================
// LLM Response Generation
// =============================================================================

async function generateNPCResponse(
  npc: WanderersNPC,
  userMessage: string,
  state: UserState
): Promise<string> {
  const trustLevel = state.trust[npc.id];
  const recentHistory = state.history.slice(-10)
    .map(h => {
      if (h.role === 'npc') {
        const n = npcs[h.npcId as WanderersNPCId];
        return `${n?.name || 'NPC'}: ${h.content}`;
      }
      return `You: ${h.content}`;
    })
    .join('\n');

  // Determine what to reveal based on trust
  const revealableSecrets: string[] = [];
  for (const [threshold, secrets] of Object.entries(npc.revealAtTrust)) {
    if (trustLevel >= parseInt(threshold)) {
      revealableSecrets.push(...secrets);
    }
  }

  const prompt = `You are ${npc.name}, ${npc.description}

PERSONALITY: ${npc.personality.join(', ')}

VOICE PATTERNS:
${npc.voicePatterns.map(p => `- ${p}`).join('\n')}

EXAMPLE PHRASES:
${npc.examplePhrases.map(p => `- "${p}"`).join('\n')}

FACTS YOU KNOW:
${npc.facts.map(f => `- ${f}`).join('\n')}

CURRENT TRUST LEVEL: ${trustLevel}/100
${revealableSecrets.length > 0 ? `\nYOU MAY HINT AT:\n${revealableSecrets.map(s => `- ${s}`).join('\n')}` : '\nYou are guarded. Don\'t reveal much yet.'}

## Recent Conversation
${recentHistory || '(First conversation)'}

## Player said:
${userMessage}

## Your Response
Respond as ${npc.name}. Stay in character. Be brief (1-3 sentences). ${trustLevel < 50 ? 'Be guarded and suspicious.' : trustLevel < 75 ? 'Be cautiously friendly.' : 'Be more open and trusting.'}`;

  try {
    const response = await provider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 200,
    });
    return response.trim();
  } catch (error) {
    console.error('[WR] LLM error:', error);
    return npc.examplePhrases[0] || '*says nothing*';
  }
}

// =============================================================================
// Puzzle Flow
// =============================================================================

async function checkForReunion(chatId: number, state: UserState): Promise<string | null> {
  const now = new Date();
  const awayMinutes = (now.getTime() - state.lastSeen.getTime()) / 1000 / 60;

  // Check if puzzle is available
  if (awayMinutes >= CONFIG.minAwayForDigest && puzzleEngine.isPuzzleAvailable(state.caseProgress)) {
    // Generate what happened while away
    const digest = await generateDigest(state);
    state.pendingDigest = digest;
    state.currentPuzzle = digest.puzzle;
    saveState(chatId);

    // Format the reunion message
    let message = puzzleFormatter.formatDigestSummary(digest);
    message += puzzleFormatter.formatForChat(digest.puzzle);

    return message;
  }

  return null;
}

async function generateDigest(state: UserState): Promise<DailyDigest> {
  // Setup story generator with NPC knowledge
  storyGenerator.setupCast(getAllNPCKnowledge());

  // Generate fake events (in production, these would come from the idle engine)
  const { conversations, activities } = storyGenerator.generateFakeEvents(5);

  // Record them in digest generator
  for (const knowledge of getAllNPCKnowledge()) {
    digestGenerator.registerNPC(knowledge);
  }
  for (const conv of conversations) {
    digestGenerator.recordConversation(conv);
  }
  for (const act of activities) {
    digestGenerator.recordActivity(act);
  }

  // Generate the digest with puzzle
  const digest = digestGenerator.generateDigest(state.lastSeen, puzzleEngine);

  // Clear processed events
  digestGenerator.clearProcessedEvents(new Date());

  return digest;
}

function handlePuzzleAnswer(chatId: number, state: UserState, answer: string): string {
  if (!state.currentPuzzle) {
    return "There's no puzzle to solve right now. Come back later!";
  }

  // Check if answer is valid (1, 2, or 3)
  const num = parseInt(answer);
  if (isNaN(num) || num < 1 || num > 3) {
    return "Reply with 1, 2, or 3 to choose which statement is the lie.";
  }

  // Solve the puzzle
  const { puzzle, progress, result } = puzzleEngine.solvePuzzle(
    state.currentPuzzle,
    answer,
    state.caseProgress
  );

  state.currentPuzzle = undefined;
  state.caseProgress = progress;
  state.pendingDigest = undefined;
  state.lastSeen = new Date();
  saveState(chatId);

  // Format result
  return puzzleFormatter.formatResult(result, puzzle);
}

// =============================================================================
// Commands
// =============================================================================

const COMMANDS: Record<string, (chatId: number, state: UserState, args?: string) => Promise<string>> = {
  async START(chatId, state) {
    state.isNewUser = false;
    state.sessionCount++;
    saveState(chatId);
    return tavernWelcome;
  },

  async HELP(chatId, state) {
    return `**Wanderer's Rest Commands**

Talk to the regulars to build trust and gather clues.

**Talk to someone:**
MAREN, KIRA, ALDRIC, ELENA, THOM

**Game:**
PUZZLE - Get today's puzzle (if available)
PROGRESS - See your case progress
STATUS - Who's in the tavern

**Other:**
RESET - Start over
`;
  },

  async STATUS(chatId, state) {
    let status = `**Wanderer's Rest**\n\n`;
    status += `**Current case:** ${harrenCase.name}\n`;
    status += `**Progress:** ${state.caseProgress.progressPoints}/${state.caseProgress.pointsToSolve} points\n`;
    status += `**Puzzles solved:** ${state.caseProgress.puzzlesSolved}\n`;
    status += `**Current streak:** ${state.caseProgress.currentStreak}\n\n`;
    status += `**In the tavern:**\n`;
    status += coreCast.map(n => `${n.emoji} ${n.name} - ${n.role}`).join('\n');
    return status;
  },

  async PROGRESS(chatId, state) {
    const p = state.caseProgress;
    const percent = Math.round((p.progressPoints / p.pointsToSolve) * 100);
    const bar = '▓'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));

    let msg = `**Case: ${harrenCase.name}**\n\n`;
    msg += `Progress: ${percent}%\n`;
    msg += `${bar}\n\n`;
    msg += `Points: ${p.progressPoints}/${p.pointsToSolve}\n`;
    msg += `Puzzles solved: ${p.puzzlesSolved}\n`;
    msg += `Puzzles failed: ${p.puzzlesFailed}\n`;
    msg += `Current streak: ${p.currentStreak}\n`;
    msg += `Best streak: ${p.longestStreak}\n`;

    if (p.status === 'solved') {
      msg += `\n🎉 **CASE SOLVED!**`;
    }

    return msg;
  },

  async PUZZLE(chatId, state) {
    if (state.currentPuzzle) {
      return puzzleFormatter.formatForChat(state.currentPuzzle);
    }

    if (puzzleEngine.isPuzzleAvailable(state.caseProgress)) {
      const digest = await generateDigest(state);
      state.currentPuzzle = digest.puzzle;
      saveState(chatId);

      let msg = puzzleFormatter.formatDigestSummary(digest);
      msg += puzzleFormatter.formatForChat(digest.puzzle);
      return msg;
    }

    return "No puzzle available yet. Come back after some time has passed!";
  },

  async RESET(chatId, state) {
    userStates.delete(chatId);
    persistence.delete(chatId);
    return "The tavern fades from memory. When you return, it will be as if for the first time.";
  },

  // Talk to NPCs
  async MAREN(chatId, state) { return startConversation(chatId, state, 'maren'); },
  async KIRA(chatId, state) { return startConversation(chatId, state, 'kira'); },
  async ALDRIC(chatId, state) { return startConversation(chatId, state, 'aldric'); },
  async ELENA(chatId, state) { return startConversation(chatId, state, 'elena'); },
  async THOM(chatId, state) { return startConversation(chatId, state, 'thom'); },
};

async function startConversation(chatId: number, state: UserState, npcId: WanderersNPCId): Promise<string> {
  const npc = npcs[npcId];
  state.talkingTo = npcId;
  saveState(chatId);

  // Generate a greeting based on trust
  const trust = state.trust[npcId];
  const response = await generateNPCResponse(npc, '(You approach them)', state);

  return `${npc.emoji} **${npc.name}:** ${response}`;
}

// =============================================================================
// Message Handling
// =============================================================================

async function handleMessage(chatId: number, text: string): Promise<string> {
  const state = getState(chatId);
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  // Check for puzzle answer (1, 2, or 3) if puzzle is pending
  if (state.currentPuzzle && /^[123]$/.test(trimmed)) {
    return handlePuzzleAnswer(chatId, state, trimmed);
  }

  // Check for commands
  if (COMMANDS[upper]) {
    return COMMANDS[upper](chatId, state);
  }

  // Check if returning after being away
  if (state.history.length > 0) {
    const reunion = await checkForReunion(chatId, state);
    if (reunion) {
      return reunion;
    }
  }

  // Check for NPC name mentions
  const npcMention = npcList.find(n =>
    upper.startsWith(n.name.toUpperCase()) ||
    upper.startsWith(`@${n.name.toUpperCase()}`)
  );

  if (npcMention) {
    state.talkingTo = npcMention.id;
    const actualMessage = trimmed.slice(npcMention.name.length).trim().replace(/^[,:]?\s*/, '');
    if (actualMessage) {
      return processMessage(chatId, state, actualMessage, npcMention);
    } else {
      return startConversation(chatId, state, npcMention.id);
    }
  }

  // If already talking to someone, continue that conversation
  if (state.talkingTo) {
    const npc = npcs[state.talkingTo];
    return processMessage(chatId, state, trimmed, npc);
  }

  // Default: talk to Maren (the barkeep)
  state.talkingTo = 'maren';
  return processMessage(chatId, state, trimmed, npcs.maren);
}

async function processMessage(
  chatId: number,
  state: UserState,
  message: string,
  npc: WanderersNPC
): Promise<string> {
  state.talkingTo = npc.id;
  state.lastSeen = new Date();

  // Add user message to history
  state.history.push({
    role: 'user',
    content: message,
    timestamp: new Date(),
  });

  // Generate NPC response
  const response = await generateNPCResponse(npc, message, state);

  // Add NPC response to history
  state.history.push({
    role: 'npc',
    npcId: npc.id,
    content: response,
    timestamp: new Date(),
  });

  // Slightly increase trust through conversation
  state.trust[npc.id] = Math.min(100, state.trust[npc.id] + 1);

  saveState(chatId);

  return `${npc.emoji} **${npc.name}:** ${response}`;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('');
  console.log('🍺 Starting Wanderer\'s Rest...');
  console.log('   A tavern mystery where time passes without you.');
  console.log('');

  // Check for bot token
  const botToken = process.env.WANDERERS_REST_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('❌ No Telegram bot token found!');
    console.error('   Set WANDERERS_REST_TELEGRAM_BOT_TOKEN in your .env file');
    console.error('   Get a token from @BotFather on Telegram');
    process.exit(1);
  }

  // Create LLM provider
  const llmProvider = process.env.LLM_PROVIDER || 'kimi';
  const modelConfig: ModelConfig = {
    provider: llmProvider as any,
    modelName: process.env[`${llmProvider.toUpperCase()}_MODEL`] || 'moonshot-v1-32k',
    apiKey: process.env[`${llmProvider.toUpperCase()}_API_KEY`],
    endpoint: process.env[`${llmProvider.toUpperCase()}_ENDPOINT`],
  };

  if (!modelConfig.apiKey && llmProvider !== 'ollama') {
    console.error(`❌ No API key for ${llmProvider}!`);
    console.error(`   Set ${llmProvider.toUpperCase()}_API_KEY in your .env file`);
    process.exit(1);
  }

  provider = createProvider(modelConfig);
  console.log(`✓ LLM Provider: ${llmProvider}`);

  // Initialize puzzle system
  puzzleEngine = new PuzzleEngine({ pointsToSolve: CONFIG.puzzlePointsToSolve });
  puzzleFormatter = new PuzzleFormatter();
  digestGenerator = new DigestGenerator();
  storyGenerator = new StoryGenerator();

  console.log('✓ Puzzle engine ready');

  // Create bot
  bot = new Bot(botToken);

  // Handle messages
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    console.log(`[${chatId}] ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`);

    try {
      const response = await handleMessage(chatId, text);
      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error(`[${chatId}] Error:`, error);
      await ctx.reply("*The tavern grows quiet. Something went wrong.* Try again?");
    }
  });

  // Start bot
  console.log('');
  console.log('✓ Bot starting...');

  bot.start({
    onStart: (botInfo) => {
      console.log(`✓ @${botInfo.username} is running!`);
      console.log('');
      console.log('The tavern is open:');
      coreCast.forEach(n => console.log(`  ${n.emoji} ${n.name} - ${n.role}`));
      console.log('');
      console.log('Message the bot to enter the tavern.');
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nClosing the tavern...');
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
