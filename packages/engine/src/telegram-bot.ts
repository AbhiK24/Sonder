#!/usr/bin/env node
/**
 * Sonder Telegram Bot
 *
 * Chat with Maren via Telegram with natural language routing.
 * Run: pnpm telegram
 */

import { Bot } from 'grammy';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createProvider } from './llm/providers.js';
import { loadIdentity, loadMemory } from './memory/files.js';
import type { ModelConfig, NPCIdentity, NPCMemory, LLMProvider } from './types/index.js';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// =============================================================================
// Types
// =============================================================================

interface ChatState {
  history: Array<{ role: 'player' | 'npc'; content: string }>;
  currentNPC: string;
  trust: number;
}

// =============================================================================
// State
// =============================================================================

const chatStates = new Map<number, ChatState>();

function getState(chatId: number): ChatState {
  if (!chatStates.has(chatId)) {
    chatStates.set(chatId, {
      history: [],
      currentNPC: 'maren',
      trust: 30,
    });
  }
  return chatStates.get(chatId)!;
}

// =============================================================================
// Config
// =============================================================================

function getModelConfig(): ModelConfig {
  const provider = process.env.LLM_PROVIDER ?? 'kimi';

  switch (provider) {
    case 'kimi':
      return {
        provider: 'kimi',
        modelName: process.env.KIMI_MODEL ?? 'moonshot-v1-32k',
        apiKey: process.env.KIMI_API_KEY,
      };
    case 'openai':
      return {
        provider: 'openai',
        modelName: process.env.OPENAI_MODEL ?? 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY,
      };
    case 'anthropic':
      return {
        provider: 'anthropic',
        modelName: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY,
      };
    case 'ollama':
    default:
      return {
        provider: 'ollama',
        modelName: process.env.OLLAMA_MODEL ?? 'qwen2.5:14b',
        endpoint: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434',
      };
  }
}

// =============================================================================
// Response Generators
// =============================================================================

function buildTalkPrompt(
  identity: NPCIdentity,
  memory: NPCMemory,
  playerInput: string,
  history: Array<{ role: 'player' | 'npc'; content: string }>,
  trust: number
): string {
  const recentHistory = history.slice(-10);
  const historyText = recentHistory
    .map((m) => `${m.role === 'player' ? 'Player' : identity.name}: ${m.content}`)
    .join('\n');

  const trustLevel = trust < 30 ? 'skeptical' : trust < 60 ? 'warming' : 'trusting';

  return `You are ${identity.name}, a character in "Wanderer's Rest" tavern game.

## Identity
Role: ${identity.role}
Personality: ${identity.personality.join(', ')}
Trust toward player: ${trust}/100 (${trustLevel})

## Voice (IMPORTANT - match this style)
${identity.voicePatterns.join('\n')}

## Example Phrases
${identity.examplePhrases.map((p) => `- "${p}"`).join('\n')}

## Quirks
${identity.quirks.join('\n')}

## What You Know About Player
${memory.aboutPlayer.map((a) => `- ${a.content}`).join('\n') || '(New arrival - just inherited the tavern)'}

## Conversation
${historyText}

Player: ${playerInput}

---
Respond as ${identity.name}. 1-3 sentences. Stay in character.

${identity.name}:`;
}

async function generateTalkResponse(
  provider: LLMProvider,
  identity: NPCIdentity,
  memory: NPCMemory,
  input: string,
  state: ChatState
): Promise<string> {
  const prompt = buildTalkPrompt(identity, memory, input, state.history, state.trust);
  const response = await provider.generate(prompt, { temperature: 0.8, maxTokens: 200 });
  return response.trim().replace(/^Maren:\s*/i, '');
}

async function generateLookResponse(provider: LLMProvider): Promise<string> {
  const prompt = `You are the narrator for a cozy tavern game.

Describe Wanderer's Rest tavern in 2-3 atmospheric sentences:
- Old wooden beams, fireplace, worn bar
- Evening light, quiet hour
- Maren behind the bar, polishing glasses
- A few empty tables, well-worn chairs

Keep it moody and evocative. Present tense.`;

  const response = await provider.generate(prompt, { temperature: 0.7, maxTokens: 150 });
  return response.trim();
}

async function generateObserveResponse(
  provider: LLMProvider,
  identity: NPCIdentity,
  trust: number
): Promise<string> {
  const trustDesc = trust < 30 ? 'guarded, watching you carefully' :
                    trust < 60 ? 'busy but occasionally glancing your way' :
                    'relaxed, comfortable with your presence';

  const prompt = `Describe ${identity.name} the barkeep in 2-3 sentences.

She is: ${identity.personality.join(', ')}
Current demeanor: ${trustDesc}
Quirks: ${identity.quirks.join(', ')}

Describe what the player sees watching her. Present tense, atmospheric.`;

  const response = await provider.generate(prompt, { temperature: 0.7, maxTokens: 150 });
  return response.trim();
}

function generateStatusResponse(state: ChatState): string {
  const trustLevel = state.trust < 30 ? 'Stranger' :
                     state.trust < 50 ? 'New Face' :
                     state.trust < 70 ? 'Regular' : 'Trusted';

  return `*Your Status*\n\n` +
    `Trust with Maren: ${state.trust}/100 (${trustLevel})\n` +
    `Conversations: ${Math.floor(state.history.length / 2)}\n\n` +
    `_You're the new owner of Wanderer's Rest. Maren is watching to see if you're worthy._`;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Starting Sonder Telegram Bot...\n');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  const modelConfig = getModelConfig();
  console.log(`LLM: ${modelConfig.provider} / ${modelConfig.modelName}`);

  const provider = createProvider(modelConfig);

  // Load Maren
  const soulPath = resolve(__dirname, '../../../packages/souls/wanderers-rest');
  const marenPath = resolve(soulPath, 'npcs/maren');

  const identity = await loadIdentity(resolve(marenPath, 'IDENTITY.md'));
  const memory = await loadMemory(resolve(marenPath, 'MEMORY.md'));
  console.log(`Loaded: ${identity.name}\n`);

  const bot = new Bot(botToken);

  // /start
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    chatStates.set(chatId, { history: [], currentNPC: 'maren', trust: 30 });

    await ctx.reply(
      `*Wanderer's Rest*\n\n` +
      `The tavern door creaks open.\n` +
      `Firelight. Woodsmoke. Old ale.\n\n` +
      `A woman behind the bar looks up.\n\n` +
      `_"New owner, is it? Maren. I run this place."_\n\n` +
      `What do you say?`,
      { parse_mode: 'Markdown' }
    );
  });

  // /start is the only slash command (Telegram standard)

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*Wanderer's Rest*\n\n` +
      `Talk naturally to Maren - she'll respond.\n\n` +
      `*Game Commands (ALL CAPS):*\n` +
      `\`LOOK\` - Look around the tavern\n` +
      `\`OBSERVE\` - Watch Maren closely\n` +
      `\`STATUS\` - Check your reputation\n` +
      `\`LEAVE\` - Step away\n` +
      `\`RESET\` - Start over\n\n` +
      `_Just type normally to talk._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Handle messages
  bot.on('message:text', async (ctx) => {
    const input = ctx.message.text;
    if (input.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const state = getState(chatId);
    const trimmed = input.trim();

    // Check for ALL CAPS game commands
    if (trimmed === 'LOOK') {
      await ctx.replyWithChatAction('typing');
      const response = await generateLookResponse(provider);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });
      return;
    }

    if (trimmed === 'OBSERVE') {
      await ctx.replyWithChatAction('typing');
      const response = await generateObserveResponse(provider, identity, state.trust);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });
      return;
    }

    if (trimmed === 'STATUS') {
      await ctx.reply(generateStatusResponse(state), { parse_mode: 'Markdown' });
      return;
    }

    if (trimmed === 'LEAVE') {
      await ctx.reply(
        `_Maren nods once. "Travel safe."_\n\n` +
        `_You step back from the bar. The tavern continues around you._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (trimmed === 'RESET') {
      chatStates.delete(chatId);
      await ctx.reply('_The world shimmers and resets..._', { parse_mode: 'Markdown' });
      return;
    }

    // Regular conversation with Maren
    await ctx.replyWithChatAction('typing');

    try {
      const response = await generateTalkResponse(provider, identity, memory, input, state);

      // Update history
      state.history.push({ role: 'player', content: input });
      state.history.push({ role: 'npc', content: response });

      // Trust gain for conversation
      if (state.trust < 100) {
        state.trust += 1;
      }

      // Keep history bounded
      if (state.history.length > 40) {
        state.history.splice(0, 2);
      }

      console.log(`[${chatId}] "${input.slice(0, 30)}..." → Maren`);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error:', error);
      await ctx.reply('_Maren pauses, distracted. Try again._', { parse_mode: 'Markdown' });
    }
  });

  bot.catch((err) => console.error('Bot error:', err));

  console.log('Bot running! Send /start to @WandererRestBot\n');
  await bot.start();
}

main().catch(console.error);
