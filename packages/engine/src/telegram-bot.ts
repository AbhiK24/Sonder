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
import { tokenTracker } from './utils/token-tracker.js';
import { Persistence } from './utils/persistence.js';
import { FactStore, Fact } from './utils/fact-store.js';
import { AssertionExtractor } from './utils/assertion-extractor.js';
import { LieDetector, LieAlert } from './utils/lie-detector.js';
import type { ModelConfig, NPCIdentity, NPCMemory, LLMProvider } from './types/index.js';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// =============================================================================
// Types
// =============================================================================

interface NPCState {
  identity: NPCIdentity;
  memory: NPCMemory;
  trust: number;
  history: Array<{ role: 'player' | 'npc'; content: string }>;
}

interface WorldEvent {
  time: Date;
  description: string;
  participants: string[];
  seen: boolean;
}

interface ChatState {
  currentNPC: string;
  npcs: Map<string, NPCState>;
  lastSeen: Date;
  events: WorldEvent[];
  day: number;
  factStore: FactStore;
}

// =============================================================================
// State
// =============================================================================

const chatStates = new Map<number, ChatState>();

// Global NPC data (loaded once at startup)
let loadedNPCs: Map<string, { identity: NPCIdentity; memory: NPCMemory }> = new Map();

// Persistence
const saveDir = process.env.SAVE_PATH?.replace('~', process.env.HOME || '') || './saves';
const persistence = new Persistence(saveDir);

function getState(chatId: number): ChatState {
  if (!chatStates.has(chatId)) {
    // Try to load from persistence
    const saved = persistence.load(chatId);

    if (saved) {
      // Restore from save
      const npcs = new Map<string, NPCState>();
      for (const savedNpc of saved.npcs) {
        const data = loadedNPCs.get(savedNpc.id);
        if (data) {
          npcs.set(savedNpc.id, {
            identity: data.identity,
            memory: data.memory,
            trust: savedNpc.trust,
            history: savedNpc.history,
          });
        }
      }
      // Add any new NPCs not in save
      for (const [id, data] of loadedNPCs) {
        if (!npcs.has(id)) {
          npcs.set(id, {
            identity: data.identity,
            memory: data.memory,
            trust: 30,
            history: [],
          });
        }
      }
      // Restore fact store
      const factStore = (saved as any).facts
        ? FactStore.deserialize((saved as any).facts)
        : new FactStore();

      chatStates.set(chatId, {
        currentNPC: saved.currentNPC,
        npcs,
        lastSeen: new Date(saved.lastSeen),
        events: saved.events.map(e => ({ ...e, time: new Date(e.time) })),
        day: saved.day,
        factStore,
      });
      console.log(`[${chatId}] Loaded save (Day ${saved.day}, ${factStore.getAllFacts().length} facts)`);
    } else {
      // Fresh state
      const npcs = new Map<string, NPCState>();
      for (const [id, data] of loadedNPCs) {
        npcs.set(id, {
          identity: data.identity,
          memory: data.memory,
          trust: 30,
          history: [],
        });
      }
      chatStates.set(chatId, {
        currentNPC: 'maren',
        npcs,
        lastSeen: new Date(),
        events: [],
        day: 1,
        factStore: new FactStore(),
      });
    }
  }
  return chatStates.get(chatId)!;
}

function saveState(chatId: number): void {
  const state = chatStates.get(chatId);
  if (!state) return;

  const npcs: Array<{ id: string; trust: number; history: Array<{ role: 'player' | 'npc'; content: string }> }> = [];
  for (const [id, npc] of state.npcs) {
    npcs.push({
      id,
      trust: npc.trust,
      history: npc.history.slice(-20), // Keep last 20 exchanges
    });
  }

  persistence.save({
    chatId,
    currentNPC: state.currentNPC,
    npcs,
    lastSeen: state.lastSeen.toISOString(),
    events: state.events.slice(-50).map(e => ({
      time: e.time.toISOString(),
      description: e.description,
      participants: e.participants,
      seen: e.seen,
    })),
    day: state.day,
    savedAt: new Date().toISOString(),
    facts: state.factStore.serialize(),
  } as any);
}

function getCurrentNPC(state: ChatState): NPCState | undefined {
  return state.npcs.get(state.currentNPC);
}

// =============================================================================
// World Tick - What happens while you're away
// =============================================================================

async function simulateTimeAway(
  provider: LLMProvider,
  state: ChatState,
  hoursAway: number
): Promise<WorldEvent[]> {
  if (hoursAway < 1) return [];

  // Build NPC context
  const npcContext = Array.from(state.npcs.values())
    .map(npc => `${npc.identity.name} (${npc.identity.role}): trust ${npc.trust}/100`)
    .join('\n');

  const prompt = `You are simulating what happened at Wanderer's Rest tavern while the owner was away.

Time passed: ${Math.floor(hoursAway)} hours
Day: ${state.day}

NPCs present:
${npcContext}

Generate 1-3 small events that happened. These should be:
- Mundane tavern life (customers coming/going, conversations)
- Occasionally interesting (a dispute, a revelation, something noticed)
- Character-building moments between NPCs

Format as JSON array:
[
  {"description": "Kira and Maren shared a quiet drink after closing.", "participants": ["kira", "maren"]},
  {"description": "A merchant passed through asking about the old owner.", "participants": ["maren"]}
]

Keep descriptions to one sentence. Make them feel natural, not dramatic.`;

  try {
    const result = await provider.generateJSON<Array<{description: string; participants: string[]}>>(prompt);
    return result.map(e => ({
      time: new Date(),
      description: e.description,
      participants: e.participants,
      seen: false,
    }));
  } catch {
    return [];
  }
}

function getUnseenEvents(state: ChatState): WorldEvent[] {
  return state.events.filter(e => !e.seen);
}

function markEventsSeen(state: ChatState): void {
  for (const event of state.events) {
    event.seen = true;
  }
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
  npc: NPCState,
  playerInput: string
): string {
  const { identity, memory, trust, history } = npc;
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
  npc: NPCState,
  input: string,
  chatId: number
): Promise<string> {
  const prompt = buildTalkPrompt(npc, input);
  const response = await provider.generate(prompt, { temperature: 0.8, maxTokens: 200 });

  // Track tokens
  tokenTracker.track(chatId, 'chat',
    tokenTracker.estimateTokens(prompt),
    tokenTracker.estimateTokens(response)
  );

  return response.trim().replace(new RegExp(`^${npc.identity.name}:\\s*`, 'i'), '');
}

// =============================================================================
// TAVERN VOICE - The place itself observes
// =============================================================================

async function generateTavernVoice(
  provider: LLMProvider,
  state: ChatState,
  chatId: number
): Promise<string> {
  const timeOfDay = 'evening';

  // Build list of present NPCs
  const presentList: string[] = [];
  for (const [id, npc] of state.npcs) {
    if (id === 'maren') {
      presentList.push('Maren (behind the bar, polishing glasses)');
    } else if (id === 'kira') {
      presentList.push('Kira (at a corner table, goods spread before her)');
    }
  }
  const presentNPCs = presentList.join(', ');

  const currentNpc = getCurrentNPC(state);
  const trust = currentNpc?.trust ?? 30;

  const prompt = `You are the Tavern — Wanderer's Rest itself. You have stood for 200 years.
You are not a narrator. You are the place. You observe. You describe. You never judge.

YOUR VOICE:
- Short sentences, present tense
- Sensory details: fire, shadows, sounds, smells
- Notice what humans might miss
- Poetic but grounded, never purple prose
- Never advise, never judge

---

Time: ${timeOfDay}
Present: ${presentNPCs}
Overall mood: ${trust < 40 ? 'watchful, cautious' : trust < 70 ? 'settling, warming' : 'comfortable, like home'}

---

Describe the scene in 3-5 short sentences. Pure observation. Present tense.
Mention who is present and what they're doing.`;

  const response = await provider.generate(prompt, { temperature: 0.7, maxTokens: 150 });

  tokenTracker.track(chatId, 'voices',
    tokenTracker.estimateTokens(prompt),
    tokenTracker.estimateTokens(response)
  );

  return response.trim();
}

// =============================================================================
// GUT VOICE - Player's internal instinct
// =============================================================================

async function generateGutVoice(
  provider: LLMProvider,
  state: ChatState,
  chatId: number
): Promise<string> {
  // Build relationship summary
  const relationships: string[] = [];
  for (const [id, npc] of state.npcs) {
    const trustDesc = npc.trust < 30 ? 'stranger' :
                      npc.trust < 50 ? 'acquaintance' :
                      npc.trust < 70 ? 'warming up' : 'trusting';
    relationships.push(`${npc.identity.name}: ${npc.trust}/100 (${trustDesc})`);
  }

  const currentNpc = getCurrentNPC(state);
  const currentName = currentNpc?.identity.name ?? 'no one';
  const totalConversations = Array.from(state.npcs.values())
    .reduce((sum, npc) => sum + Math.floor(npc.history.length / 2), 0);

  const prompt = `You are the player's gut instinct. Their internal voice. What they know, what's at stake.

YOUR VOICE:
- Second person, direct: "You sense..." "You know..."
- Surface stakes naturally
- Show what the player knows that matters NOW
- Present options without forcing choice
- Terse, punchy, no flowery language

---

You're the new owner of Wanderer's Rest tavern.
Currently talking to: ${currentName}

Relationships:
${relationships.map(r => `→ ${r}`).join('\n')}

Total conversations: ${totalConversations}

What you're trying to do:
→ Prove you're worthy of owning this place
→ Earn trust from those here
→ Learn the tavern's secrets

---

2-4 lines. Stakes first. What you sense. What you could try next.
Use → for status lines. Be the player's instinct, not a game guide.`;

  const response = await provider.generate(prompt, { temperature: 0.7, maxTokens: 150 });

  tokenTracker.track(chatId, 'voices',
    tokenTracker.estimateTokens(prompt),
    tokenTracker.estimateTokens(response)
  );

  return response.trim();
}

async function generateObserveResponse(
  provider: LLMProvider,
  npc: NPCState
): Promise<string> {
  const { identity, trust } = npc;
  const trustDesc = trust < 30 ? 'guarded, watching you carefully' :
                    trust < 60 ? 'busy but occasionally glancing your way' :
                    'relaxed, comfortable with your presence';

  const prompt = `Describe ${identity.name} the ${identity.role.toLowerCase()} in 2-3 sentences.

They are: ${identity.personality.join(', ')}
Current demeanor: ${trustDesc}
Quirks: ${identity.quirks.join(', ')}

Describe what the player sees watching them. Present tense, atmospheric.`;

  const response = await provider.generate(prompt, { temperature: 0.7, maxTokens: 150 });
  return response.trim();
}

function generateStatusResponse(state: ChatState): string {
  const lines: string[] = ['*Your Status*\n'];

  for (const [id, npc] of state.npcs) {
    const trustLevel = npc.trust < 30 ? 'Stranger' :
                       npc.trust < 50 ? 'New Face' :
                       npc.trust < 70 ? 'Regular' : 'Trusted';
    const convos = Math.floor(npc.history.length / 2);
    const current = id === state.currentNPC ? ' (talking)' : '';
    lines.push(`*${npc.identity.name}*${current}: ${npc.trust}/100 (${trustLevel}) - ${convos} chats`);
  }

  lines.push('\n_You\'re the new owner of Wanderer\'s Rest._');
  return lines.join('\n');
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

  // Load all NPCs
  const soulPath = resolve(__dirname, '../../../packages/souls/wanderers-rest/npcs');

  const npcIds = ['maren', 'kira'];
  for (const npcId of npcIds) {
    try {
      const npcPath = resolve(soulPath, npcId);
      const identity = await loadIdentity(resolve(npcPath, 'IDENTITY.md'));
      const memory = await loadMemory(resolve(npcPath, 'MEMORY.md'));
      loadedNPCs.set(npcId, { identity, memory });
      console.log(`Loaded: ${identity.name} (${identity.role})`);
    } catch (e) {
      console.error(`Failed to load NPC ${npcId}:`, e);
    }
  }
  console.log();

  const bot = new Bot(botToken);

  // /start
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    chatStates.delete(chatId); // Clear old state
    const state = getState(chatId); // Create fresh state

    await ctx.reply(
      `*Wanderer's Rest*\n\n` +
      `The tavern door creaks open.\n` +
      `Firelight. Woodsmoke. Old ale.\n\n` +
      `Behind the bar, a weathered woman looks up. At a corner table, a merchant arranges her wares.\n\n` +
      `The barkeep speaks first.\n\n` +
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
      `Talk naturally - NPCs respond.\n\n` +
      `*Game Commands (ALL CAPS):*\n` +
      `\`LOOK\` - The tavern describes itself\n` +
      `\`THINK\` - Your gut instinct speaks\n` +
      `\`OBSERVE\` - Watch who you're talking to\n` +
      `\`STATUS\` - See all relationships\n` +
      `\`FACTS\` - What you've learned\n` +
      `\`SUSPICIONS\` - Inconsistencies noticed\n` +
      `\`RECAP\` - What happened while away\n` +
      `\`TOKENS\` - View token usage\n` +
      `\`LEAVE\` - Step away\n` +
      `\`RESET\` - Start over\n\n` +
      `*Switch NPCs:*\n` +
      `\`MAREN\` - Talk to the barkeep\n` +
      `\`KIRA\` - Talk to the merchant\n\n` +
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
    const trimmed = input.trim().toUpperCase();
    const currentNpc = getCurrentNPC(state);

    // === CHECK TIME AWAY & SIMULATE ===
    const now = new Date();
    const hoursAway = (now.getTime() - state.lastSeen.getTime()) / (1000 * 60 * 60);

    if (hoursAway >= 1) {
      // Simulate what happened
      const newEvents = await simulateTimeAway(provider, state, hoursAway);
      state.events.push(...newEvents);

      // Advance day if 24+ hours
      if (hoursAway >= 24) {
        state.day += Math.floor(hoursAway / 24);
      }

      // Show recap if there are new events
      if (newEvents.length > 0) {
        const recap = newEvents.map(e => `• ${e.description}`).join('\n');
        await ctx.reply(
          `*While you were away...*\n\n${recap}\n\n_Day ${state.day} at Wanderer's Rest._`,
          { parse_mode: 'Markdown' }
        );
        markEventsSeen(state);
        saveState(chatId);
      }
    }

    state.lastSeen = now;

    // === GAME COMMANDS (ALL CAPS) ===

    // LOOK - Tavern Voice
    if (trimmed === 'LOOK') {
      await ctx.replyWithChatAction('typing');
      const response = await generateTavernVoice(provider, state, chatId);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });
      return;
    }

    // THINK - Gut Voice
    if (trimmed === 'THINK') {
      await ctx.replyWithChatAction('typing');
      const response = await generateGutVoice(provider, state, chatId);
      await ctx.reply(response, { parse_mode: 'Markdown' });
      return;
    }

    // OBSERVE - Watch current NPC
    if (trimmed === 'OBSERVE') {
      if (!currentNpc) {
        await ctx.reply('_No one to observe._', { parse_mode: 'Markdown' });
        return;
      }
      await ctx.replyWithChatAction('typing');
      const response = await generateObserveResponse(provider, currentNpc);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });
      return;
    }

    // STATUS
    if (trimmed === 'STATUS') {
      await ctx.reply(generateStatusResponse(state), { parse_mode: 'Markdown' });
      return;
    }

    // LEAVE
    if (trimmed === 'LEAVE') {
      const name = currentNpc?.identity.name ?? 'They';
      await ctx.reply(
        `_${name} nods as you step back. The tavern continues around you._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // RESET
    if (trimmed === 'RESET') {
      chatStates.delete(chatId);
      persistence.delete(chatId);
      await ctx.reply('_The world shimmers and resets..._', { parse_mode: 'Markdown' });
      return;
    }

    // RECAP - What happened while away
    if (trimmed === 'RECAP') {
      const unseen = getUnseenEvents(state);
      if (unseen.length === 0) {
        await ctx.reply('_Nothing new has happened since you were last here._', { parse_mode: 'Markdown' });
      } else {
        const recap = unseen.map(e => `• ${e.description}`).join('\n');
        markEventsSeen(state);
        await ctx.reply(
          `*While you were away...*\n\n${recap}`,
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    // TOKENS - Show token usage
    if (trimmed === 'TOKENS') {
      await ctx.reply(tokenTracker.formatStats(chatId), { parse_mode: 'Markdown' });
      return;
    }

    // FACTS - Show what player has learned
    if (trimmed === 'FACTS') {
      const facts = state.factStore.getAllFacts();
      if (facts.length === 0) {
        await ctx.reply('_You haven\'t learned anything concrete yet. Keep talking._', { parse_mode: 'Markdown' });
        return;
      }

      // Group by subject
      const bySubject = new Map<string, Fact[]>();
      for (const fact of facts) {
        if (!bySubject.has(fact.subject)) {
          bySubject.set(fact.subject, []);
        }
        bySubject.get(fact.subject)!.push(fact);
      }

      const lines = ['*What You Know*\n'];
      for (const [subject, subjectFacts] of bySubject) {
        lines.push(`\n_About ${subject}:_`);
        for (const fact of subjectFacts.slice(-5)) {
          const icon = {
            'unverified': '❓',
            'verified': '✓',
            'contradicted': '⚠️',
            'lie': '✗',
            'truth': '✓✓',
          }[fact.status];
          const source = fact.source.type === 'npc' ? fact.source.name : 'you';
          lines.push(`${icon} "${fact.claim}" _(${source})_`);
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    // SUSPICIONS - Show contradictions and questionable claims
    if (trimmed === 'SUSPICIONS') {
      const lieDetector = new LieDetector(provider, state.factStore);
      const suspicions = lieDetector.formatSuspicions();
      await ctx.reply(suspicions, { parse_mode: 'Markdown' });
      return;
    }

    // === NPC SWITCHING ===
    for (const [npcId, npcData] of loadedNPCs) {
      if (trimmed === npcId.toUpperCase() || trimmed === npcData.identity.name.toUpperCase()) {
        if (state.currentNPC === npcId) {
          await ctx.reply(`_You're already talking to ${npcData.identity.name}._`, { parse_mode: 'Markdown' });
          return;
        }

        state.currentNPC = npcId;
        const npc = state.npcs.get(npcId)!;

        // Generate a greeting from the new NPC
        await ctx.replyWithChatAction('typing');
        const greetingPrompt = `You are ${npc.identity.name}, a ${npc.identity.role.toLowerCase()}.
Personality: ${npc.identity.personality.join(', ')}
Voice: ${npc.identity.voicePatterns.join(', ')}

The player approaches you to talk. Give a brief greeting (1-2 sentences) in character.
Trust level: ${npc.trust}/100

${npc.identity.name}:`;

        const greeting = await provider.generate(greetingPrompt, { temperature: 0.8, maxTokens: 100 });
        const cleanGreeting = greeting.trim().replace(new RegExp(`^${npc.identity.name}:\\s*`, 'i'), '');

        console.log(`[${chatId}] Switched to ${npc.identity.name}`);
        saveState(chatId);
        await ctx.reply(
          `_You turn to ${npc.identity.name}._\n\n_${cleanGreeting}_`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // === REGULAR CONVERSATION ===
    if (!currentNpc) {
      await ctx.reply('_No one to talk to. Try MAREN or KIRA._', { parse_mode: 'Markdown' });
      return;
    }

    await ctx.replyWithChatAction('typing');

    try {
      const response = await generateTalkResponse(provider, currentNpc, input.trim(), chatId);

      // Update history
      currentNpc.history.push({ role: 'player', content: input.trim() });
      currentNpc.history.push({ role: 'npc', content: response });

      // Trust gain
      if (currentNpc.trust < 100) {
        currentNpc.trust += 1;
      }

      // Keep history bounded
      if (currentNpc.history.length > 40) {
        currentNpc.history.splice(0, 2);
      }

      // === ASSERTION EXTRACTION ===
      // Extract facts from the conversation (runs in background, doesn't block)
      const extractor = new AssertionExtractor(provider);
      const lastExchanges = currentNpc.history.slice(-4); // Last 2 exchanges

      // Don't await - let it run async
      extractor.extract(lastExchanges, currentNpc.identity.name, state.day)
        .then(async ({ assertions, tokensUsed }) => {
          tokenTracker.track(chatId, 'router', tokensUsed, 0);

          if (assertions.length === 0) return;

          const lieDetector = new LieDetector(provider, state.factStore);
          let lieAlert: LieAlert | null = null;

          // Add facts and check for lies
          for (const assertion of assertions) {
            const { fact, contradictions } = state.factStore.addFact(
              assertion.subject,
              assertion.claim,
              {
                type: assertion.speaker === 'player' ? 'player' : 'npc',
                name: assertion.speaker === 'player' ? 'player' : currentNpc.identity.name.toLowerCase(),
                day: state.day,
                context: assertion.isAboutSelf ? 'self-claim' : undefined,
              }
            );

            // Check for lies if this is an NPC claim
            if (assertion.speaker !== 'player' && contradictions.length > 0 && !lieAlert) {
              const { alert, tokensUsed: alertTokens } = await lieDetector.checkClaim(
                currentNpc.identity.name,
                assertion.claim,
                assertion.subject
              );
              tokenTracker.track(chatId, 'router', alertTokens, 0);
              if (alert) {
                lieAlert = alert;
              }
            }
          }

          // Save updated facts
          saveState(chatId);

          // Send gut feeling alert if lie detected
          if (lieAlert) {
            await ctx.reply(`\n_${lieAlert.gutFeeling}_`, { parse_mode: 'Markdown' });
          }

          console.log(`[${chatId}] Extracted ${assertions.length} facts`);
        })
        .catch(err => console.error('Fact extraction error:', err));

      // Save state
      saveState(chatId);

      console.log(`[${chatId}] "${input.slice(0, 30)}..." → ${currentNpc.identity.name}`);
      await ctx.reply(`_${response}_`, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error:', error);
      await ctx.reply(`_${currentNpc.identity.name} pauses, distracted. Try again._`, { parse_mode: 'Markdown' });
    }
  });

  bot.catch((err) => console.error('Bot error:', err));

  console.log('Bot running! Send /start to @WandererRestBot\n');
  await bot.start();
}

main().catch(console.error);
