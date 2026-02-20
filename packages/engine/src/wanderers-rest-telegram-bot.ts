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
  type CaseProgress,
} from './puzzles/index.js';
import { Persistence } from './utils/persistence.js';
import type { ModelConfig, LLMProvider } from './types/index.js';
import { CaseGenerator, CaseGenerationManager, WANDERERS_REST_CONTEXT } from './case-generator.js';

// Auto-updater
import { startUpdateChecker, stopUpdateChecker, getCurrentVersion } from './updater/index.js';

// Wanderer's Rest play imports
import {
  npcs,
  npcList,
  coreCast,
  harrenCase,
  getAllNPCKnowledge,
} from '../../plays/wanderers-rest/index.js';
import type { WanderersNPC, WanderersNPCId } from '../../plays/wanderers-rest/types.js';
import {
  CASE_CONTENT,
  getDayContent,
  WELCOME_MESSAGE,
  getPostPuzzleMessage,
  getCaseSolvedMessage,
  type DayContent,
} from '../../plays/wanderers-rest/case-content.js';

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
  currentDay: number;              // Which day of the case they're on (1-15)
  lastPuzzleDate?: string;         // YYYY-MM-DD of last puzzle attempt
  todayPuzzleAttempted: boolean;   // Have they done today's puzzle?

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

  // FTUE state
  hasSeenWelcome: boolean;
  awaitingPuzzleAnswer: boolean;
  currentPuzzleContent?: DayContent;
}

// =============================================================================
// State
// =============================================================================

const userStates = new Map<number, UserState>();

// Services
let provider: LLMProvider;
let puzzleEngine: PuzzleEngine;
let bot: Bot;
let caseGenerationManager: CaseGenerationManager;

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
  currentDay: number;
  lastPuzzleDate?: string;
  todayPuzzleAttempted: boolean;
  history: UserState['history'];
  trust: Record<WanderersNPCId, number>;
  talkingTo?: WanderersNPCId;
  hasSeenWelcome: boolean;
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getState(chatId: number): UserState {
  if (!userStates.has(chatId)) {
    const saved = persistence.load<SavedWanderersState>(chatId);

    if (saved) {
      // Check if it's a new day - reset puzzle availability
      const today = getTodayString();
      const isNewDay = saved.lastPuzzleDate !== today;

      userStates.set(chatId, {
        id: chatId,
        lastSeen: new Date(saved.lastSeen),
        sessionCount: saved.sessionCount || 1,
        isNewUser: false,
        caseProgress: saved.caseProgress || puzzleEngine.createCaseProgress(
          harrenCase.id,
          harrenCase.name
        ),
        currentDay: saved.currentDay || 1,
        lastPuzzleDate: saved.lastPuzzleDate,
        todayPuzzleAttempted: isNewDay ? false : saved.todayPuzzleAttempted,
        history: saved.history || [],
        trust: saved.trust || initTrust(),
        talkingTo: saved.talkingTo,
        hasSeenWelcome: saved.hasSeenWelcome || false,
        awaitingPuzzleAnswer: false,
      });
      console.log(`[${chatId}] Loaded save (day ${saved.currentDay}, puzzleToday: ${!isNewDay && saved.todayPuzzleAttempted})`);
    } else {
      userStates.set(chatId, {
        id: chatId,
        lastSeen: new Date(),
        sessionCount: 1,
        isNewUser: true,
        caseProgress: puzzleEngine.createCaseProgress(harrenCase.id, harrenCase.name),
        currentDay: 1,
        todayPuzzleAttempted: false,
        history: [],
        trust: initTrust(),
        hasSeenWelcome: false,
        awaitingPuzzleAnswer: false,
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
    currentDay: state.currentDay,
    lastPuzzleDate: state.lastPuzzleDate,
    todayPuzzleAttempted: state.todayPuzzleAttempted,
    history: state.history.slice(-100),
    trust: state.trust,
    talkingTo: state.talkingTo,
    hasSeenWelcome: state.hasSeenWelcome,
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
Respond in character. Be brief (1-3 sentences). ${trustLevel < 50 ? 'Be guarded and suspicious.' : trustLevel < 75 ? 'Be cautiously friendly.' : 'Be more open and trusting.'}
IMPORTANT: Do NOT start with your name. Just speak directly.`;

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
// Puzzle Flow (using pre-built content)
// =============================================================================

/**
 * Format the daily puzzle for display
 */
function formatPuzzle(content: DayContent): string {
  const lines = [
    `📰 *DAY ${content.day}*`,
    '',
    content.digest,
    '',
    '---',
    '',
    '🔍 *SPOT THE LIE*',
    '',
    'One of these statements is FALSE. Which one?',
    '',
  ];

  content.statements.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.speakerEmoji} *${s.speakerName}*: "${s.statement}"`);
  });

  lines.push('');
  lines.push('Reply with *1*, *2*, or *3*');

  return lines.join('\n');
}

/**
 * Handle puzzle answer
 */
function handlePuzzleAnswer(chatId: number, state: UserState, answer: string): string {
  if (!state.awaitingPuzzleAnswer || !state.currentPuzzleContent) {
    return "There's no puzzle to solve right now.";
  }

  const num = parseInt(answer);
  if (isNaN(num) || num < 1 || num > 3) {
    return "Reply with *1*, *2*, or *3* to choose which statement is the lie.";
  }

  const content = state.currentPuzzleContent;
  const correct = num === content.correctAnswer;

  // Update progress
  let pointsEarned = 0;
  if (correct) {
    pointsEarned = 1;
    // Streak bonus
    if (state.caseProgress.currentStreak >= 2) {
      pointsEarned = 2;
    }
    state.caseProgress.progressPoints += pointsEarned;
    state.caseProgress.puzzlesSolved++;
    state.caseProgress.currentStreak++;
    state.caseProgress.longestStreak = Math.max(
      state.caseProgress.longestStreak,
      state.caseProgress.currentStreak
    );
  } else {
    state.caseProgress.puzzlesFailed++;
    state.caseProgress.currentStreak = 0;
  }

  // Mark puzzle as done for today
  state.todayPuzzleAttempted = true;
  state.lastPuzzleDate = getTodayString();
  state.awaitingPuzzleAnswer = false;
  state.currentPuzzleContent = undefined;

  // Advance to next day for tomorrow
  if (correct) {
    state.currentDay = Math.min(state.currentDay + 1, CASE_CONTENT.length);
  }

  // Check if case is solved
  const caseSolved = state.caseProgress.progressPoints >= state.caseProgress.pointsToSolve;
  if (caseSolved) {
    state.caseProgress.status = 'solved';
  }

  state.lastSeen = new Date();
  saveState(chatId);

  // Trigger background generation of next case if player is close to solving
  // This runs async in background - doesn't block the response
  const currentCaseNumber = 1; // TODO: Track actual case number in state
  caseGenerationManager.onPlayerProgress(
    String(chatId),
    currentCaseNumber,
    state.caseProgress.progressPoints,
    state.caseProgress.pointsToSolve
  );

  // Build result message
  const lieStatement = content.statements[content.correctAnswer - 1];
  let msg = '';

  if (correct) {
    msg += '✅ *CORRECT!*\n\n';
    msg += `+${pointsEarned} point${pointsEarned > 1 ? 's' : ''}${pointsEarned > 1 ? ' (streak bonus!)' : ''}\n\n`;
    msg += `💡 ${content.revelation}\n`;
  } else {
    msg += '❌ *WRONG*\n\n';
    msg += `The lie was #${content.correctAnswer}:\n`;
    msg += `${lieStatement.speakerEmoji} ${lieStatement.speakerName}: "${lieStatement.statement}"\n`;
  }

  msg += getPostPuzzleMessage(
    correct,
    pointsEarned,
    state.caseProgress.progressPoints,
    state.caseProgress.pointsToSolve
  );

  if (caseSolved) {
    msg += '\n\n' + getCaseSolvedMessage();
  }

  return msg;
}

/**
 * Get today's puzzle if available
 */
function presentPuzzle(chatId: number, state: UserState): string | null {
  // Puzzle always available on demand (no 24hr restriction)

  // Get content for current day
  const content = getDayContent(state.currentDay);
  if (!content) {
    return null;
  }

  // Set up puzzle state
  state.awaitingPuzzleAnswer = true;
  state.currentPuzzleContent = content;
  saveState(chatId);

  return formatPuzzle(content);
}

// =============================================================================
// Commands
// =============================================================================

const COMMANDS: Record<string, (chatId: number, state: UserState, args?: string) => Promise<string>> = {
  async START(chatId, state) {
    // FTUE: Show welcome + first puzzle
    if (!state.hasSeenWelcome) {
      state.hasSeenWelcome = true;
      state.isNewUser = false;
      saveState(chatId);

      let msg = WELCOME_MESSAGE;

      // Present first puzzle immediately
      const puzzle = presentPuzzle(chatId, state);
      if (puzzle) {
        msg += puzzle;
      }

      return msg;
    }

    // Returning user - check for puzzle
    state.sessionCount++;

    // Always offer puzzle on return

    // Present puzzle
    const puzzle = presentPuzzle(chatId, state);
    if (puzzle) {
      return `Welcome back to *Wanderer's Rest*.\n\n${puzzle}`;
    }

    saveState(chatId);
    return `Welcome back to *Wanderer's Rest*.\n\nTalk to the regulars: MAREN, KIRA, ALDRIC, ELENA, THOM`;
  },

  async HELP(chatId, state) {
    return `*Wanderer's Rest Commands*

*Talk to someone:*
MAREN, KIRA, ALDRIC, ELENA, THOM

*Game:*
PUZZLE - Get today's puzzle
PROGRESS - See your case progress

*Other:*
RESET - Start over`;
  },

  async STATUS(chatId, state) {
    const p = state.caseProgress;
    const percent = Math.round((p.progressPoints / p.pointsToSolve) * 100);
    const bar = '▓'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));

    let msg = `*Wanderer's Rest*\n`;
    msg += `Day ${state.currentDay} of the investigation\n\n`;
    msg += `*Case:* ${harrenCase.name}\n`;
    msg += `*Progress:* ${p.progressPoints}/${p.pointsToSolve}\n`;
    msg += `${bar} ${percent}%\n\n`;
    msg += `Puzzles: ${p.puzzlesSolved} solved, ${p.puzzlesFailed} failed\n`;
    msg += `Streak: ${p.currentStreak} (best: ${p.longestStreak})\n`;
    msg += `Today's puzzle: ${state.todayPuzzleAttempted ? '✅ Done' : '⏳ Available'}`;

    if (p.status === 'solved') {
      msg += `\n\n🎉 *CASE SOLVED!*`;
    }

    return msg;
  },

  async PROGRESS(chatId, state) {
    return COMMANDS.STATUS(chatId, state);
  },

  async PUZZLE(chatId, state) {
    // Check if already awaiting answer
    if (state.awaitingPuzzleAnswer && state.currentPuzzleContent) {
      return formatPuzzle(state.currentPuzzleContent);
    }

    // Puzzle on demand - no daily restriction

    // Present puzzle
    const puzzle = presentPuzzle(chatId, state);
    if (puzzle) {
      return puzzle;
    }

    return "Something went wrong. Try RESET to start over.";
  },

  async RESET(chatId, state) {
    userStates.delete(chatId);
    persistence.delete(chatId);
    return "The tavern fades from memory.\n\nSend START to begin again.";
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

  // FTUE: First message triggers START
  if (!state.hasSeenWelcome) {
    return COMMANDS.START(chatId, state);
  }

  // Check for puzzle answer (1, 2, or 3) if awaiting answer
  if (state.awaitingPuzzleAnswer && /^[123]$/.test(trimmed)) {
    return handlePuzzleAnswer(chatId, state, trimmed);
  }

  // Check for commands
  if (COMMANDS[upper]) {
    return COMMANDS[upper](chatId, state);
  }

  // Check for /start (telegram format)
  if (upper === '/START') {
    return COMMANDS.START(chatId, state);
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

  // If awaiting puzzle answer, remind them
  if (state.awaitingPuzzleAnswer) {
    return "Reply with *1*, *2*, or *3* to answer the puzzle.\n\nOr type PUZZLE to see it again.";
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
  console.log(`✓ Puzzle engine ready (${CASE_CONTENT.length} days of content)`);

  // Initialize case generator for auto-generating next mysteries
  const caseGenerator = new CaseGenerator({
    provider,
    outputDir: resolve(saveDir, 'generated-cases'),
    existingNPCs: coreCast.map(n => ({ id: n.id, name: n.name, emoji: n.emoji, role: n.role })),
    previousCases: [{ id: harrenCase.id, name: harrenCase.name, resolution: harrenCase.revelation }],
    worldContext: WANDERERS_REST_CONTEXT,
  });
  caseGenerationManager = new CaseGenerationManager(caseGenerator);
  console.log(`✓ Case generator ready (auto-generates at 80% progress)`);

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
    onStart: async (botInfo) => {
      console.log(`✓ @${botInfo.username} is running!`);
      console.log('');
      console.log('The tavern is open:');
      coreCast.forEach(n => console.log(`  ${n.emoji} ${n.name} - ${n.role}`));
      console.log('');
      console.log('Message the bot to enter the tavern.');

      // Start auto-updater (checks every 6 hours)
      startUpdateChecker({
        checkInterval: 24 * 60 * 60 * 1000, // 24 hours
        autoUpdate: false,
        onUpdateAvailable: async (info) => {
          console.log(`[Updater] New version available: v${info.latestVersion}`);
        },
      });
      console.log(`[Updater] Watching for updates (v${getCurrentVersion()})`);
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nClosing the tavern...');
    stopUpdateChecker();
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
