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
import { FTUE_CASE, FTUEProgress, createFTUEProgress, checkFTUEProgression } from './cases/ftue-case.js';
import { Case, CaseManager, CaseGenerator } from './cases/index.js';
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
  ftueProgress: FTUEProgress;
  caseManager: CaseManager;
  playerName: string | null;
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

// Case generator (initialized after provider is created)
let caseGenerator: CaseGenerator;

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

      // Restore FTUE progress
      const ftueProgress: FTUEProgress = (saved as any).ftueProgress || createFTUEProgress();

      // Restore case manager
      const caseManager = (saved as any).caseManager
        ? CaseManager.deserialize((saved as any).caseManager, caseGenerator)
        : new CaseManager(caseGenerator, [{ ...FTUE_CASE }]);

      chatStates.set(chatId, {
        currentNPC: saved.currentNPC,
        npcs,
        lastSeen: new Date(saved.lastSeen),
        events: saved.events.map(e => ({ ...e, time: new Date(e.time) })),
        day: saved.day,
        factStore,
        ftueProgress,
        caseManager,
        playerName: (saved as any).playerName || null,
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
        ftueProgress: createFTUEProgress(),
        caseManager: new CaseManager(caseGenerator, [{ ...FTUE_CASE }]),
        playerName: null,
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
    ftueProgress: state.ftueProgress,
    caseManager: state.caseManager.serialize(),
    playerName: state.playerName,
  } as any);
}

// Extract player name from conversation
function extractPlayerName(input: string): string | null {
  const patterns = [
    /(?:i'?m|i am|my name is|call me|they call me|name's|the name's)\s+([a-z]{2,15})/i,
    /^([a-z]{2,15})(?:\s+here|,?\s+at your service|,?\s+nice to meet)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      const name = match[1];
      // Filter out common words that aren't names
      const notNames = ['the', 'new', 'owner', 'here', 'just', 'your', 'fine', 'good', 'well', 'not', 'yes', 'no'];
      if (!notNames.includes(name.toLowerCase())) {
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      }
    }
  }
  return null;
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

  // Scale events based on time away
  // 1-2 hours: 1-2 events, 3-5 hours: 2-3 events, 6+ hours: 3-5 events
  const minEvents = hoursAway < 3 ? 1 : hoursAway < 6 ? 2 : 3;
  const maxEvents = hoursAway < 3 ? 2 : hoursAway < 6 ? 3 : 5;

  // Build NPC context
  const npcContext = Array.from(state.npcs.values())
    .map(npc => `${npc.identity.name} (${npc.identity.role}): trust ${npc.trust}/100`)
    .join('\n');

  const prompt = `You are simulating what happened at Wanderer's Rest tavern while the owner was away.

Time passed: ${Math.floor(hoursAway)} hours
Day: ${state.day}

NPCs present:
${npcContext}

Generate ${minEvents}-${maxEvents} events that happened over these ${Math.floor(hoursAway)} hours:
- Mix of mundane tavern life and occasional intrigue
- Space them out over the time period (morning, afternoon, evening)
- Character moments between NPCs
- Maybe a hint about the mystery, a visitor, a rumor

Format as JSON array:
[
  {"description": "Morning: Aldric stopped by for breakfast, grumbling about a late payment.", "participants": ["aldric", "maren"]},
  {"description": "Afternoon: A stranger asked about rooms, then left without booking.", "participants": ["maren"]},
  {"description": "Evening: Kira and Maren shared a quiet drink after closing.", "participants": ["kira", "maren"]}
]

One sentence each. Natural, not dramatic.`;

  try {
    console.log(`[World Tick] Simulating ${Math.floor(hoursAway)} hours away...`);
    const result = await provider.generateJSON<Array<{description: string; participants: string[]}>>(prompt);
    console.log(`[World Tick] Generated ${result.length} events`);
    return result.map(e => ({
      time: new Date(),
      description: e.description,
      participants: e.participants,
      seen: false,
    }));
  } catch (err) {
    console.error('[World Tick] Failed to generate events:', err);
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

// =============================================================================
// NPC BACKSTORIES - Derived from WORLD_TRUTH.md
// =============================================================================
// Each NPC has:
// - FACTS: What they witnessed or know for certain (NEVER changes)
// - REVEAL: What they'll share at current trust level
// - HIDE: What they won't share yet
// =============================================================================

function getBackstory(npcId: string, trust: number): string {
  const backstories: Record<string, (t: number) => string> = {

    maren: (t) => `
## YOUR KNOWLEDGE (GROUND TRUTH - NEVER CONTRADICT)

WHAT YOU WITNESSED DIRECTLY:
- You found Harren's body at the bottom of cellar stairs, 3 weeks ago
- The cellar door was LOCKED FROM THE OUTSIDE - you had to break it
- He had bruises on his arms (defensive wounds)
- You saw Harren burn a letter the day before - you glimpsed a BLACK SUN seal
- He was afraid after reading it - first time you ever saw fear on him
- A hooded stranger was in the tavern that evening, asking about Harren

WHAT OTHERS TOLD YOU:
- Elena said the wounds were "wrong for a fall"
- Guard Captain Thom ruled it accident in HOURS - no real investigation

WHAT YOU BELIEVE:
- It was murder. Harren knew those stairs for 30 years.
- Thom covered something up.
- The hooded stranger did it.

${t < 40 ? `
WHAT TO SAY NOW (Trust ${t}/100 - GUARDED):
- "He fell. That's what they say."
- Don't share your doubts yet. You don't know this person.
- Deflect questions about details.` :
t < 55 ? `
WHAT TO SAY NOW (Trust ${t}/100 - HINTING):
- Can say "Men don't just fall after 30 years."
- Can mention you found the body.
- Still guarded about specifics.` :
t < 70 ? `
WHAT TO SAY NOW (Trust ${t}/100 - OPENING UP):
- Can reveal the cellar door was locked from outside.
- Can mention Thom's quick ruling was suspicious.
- Can say Elena saw the body too.` :
t < 85 ? `
WHAT TO SAY NOW (Trust ${t}/100 - TRUSTING):
- Can discuss the hooded stranger.
- Can mention Harren was afraid his last days.
- Can reveal he burned a letter.` :
`WHAT TO SAY NOW (Trust ${t}/100 - CONFIDANT):
- Can reveal the BLACK SUN seal.
- Can share everything you know.
- This person has earned your trust.`}

NEVER REVEAL: What the Black Sun means (you don't know).
`,

    kira: (t) => `
## YOUR KNOWLEDGE (GROUND TRUTH - NEVER CONTRADICT)

WHAT YOU WITNESSED DIRECTLY:
- A hooded figure asked YOU about Harren that evening - his habits, when he sleeps
- Aldric's forge was COLD that night - contradicts his claim he was working late
- You heard sounds of a struggle downstairs around 1 AM (you were staying upstairs)
- Harren and Elena argued about a rare herb the day before

WHAT YOU KNOW FROM TRADING:
- The Black Sun symbol - you've seen it in your travels. Bad news. You don't ask questions about them.
- Harren had a past. Something he ran from.

${t < 50 ? `
WHAT TO SAY NOW (Trust ${t}/100 - EVASIVE):
- "I just sell things. I don't get involved."
- Don't share what you saw or heard. Stay neutral.
- Change the subject to trade, goods, travel.` :
t < 70 ? `
WHAT TO SAY NOW (Trust ${t}/100 - SHARING):
- Can mention the forge was cold (expose Aldric's lie).
- Can mention the hooded stranger asked about Harren.
- Still won't mention hearing the struggle.` :
`WHAT TO SAY NOW (Trust ${t}/100 - HELPFUL):
- Can reveal you heard sounds that night.
- Can hint the Black Sun is dangerous.
- Can share most of what you know.`}

NEVER REVEAL: How much you know about the Black Sun. That's dangerous knowledge.
`,

    aldric: (t) => `
## YOUR KNOWLEDGE (GROUND TRUTH - NEVER CONTRADICT)

WHAT YOU WITNESSED DIRECTLY:
- You argued with Harren at 10 PM about the 50 gold he owed you
- You were NOT at the forge that night - you were drinking, then walking home
- At ~1:30 AM you SAW a hooded figure leaving the tavern's back door
- You were too scared to confront them

YOUR LIE:
- You claim you were working at the forge all night
- The forge was actually COLD (Kira knows this)

WHY YOU LIE:
- If you admit you were near the tavern, you become a suspect
- You saw something but didn't stop it - you feel guilty
- You're scared the hooded figure will come for you if you talk

${t < 50 ? `
WHAT TO SAY NOW (Trust ${t}/100 - DEFENSIVE):
- Stick to your lie: "I was at the forge all night."
- Get angry if questioned. Deflect.
- Emphasize Harren owed YOU money - why would you kill him?` :
t < 70 ? `
WHAT TO SAY NOW (Trust ${t}/100 - CRACKING):
- If pressed hard about the cold forge, get nervous.
- Might say "I stepped out for a drink, so what?"
- Still won't admit what you saw.` :
`WHAT TO SAY NOW (Trust ${t}/100 - CONFESSING):
- Can admit you weren't at the forge.
- Can reveal you saw the hooded figure leaving.
- Show how scared you are about this.`}

NEVER REVEAL: Nothing - at high trust you can share everything. You just need to feel safe.
`,

    thom: (t) => `
## YOUR KNOWLEDGE (GROUND TRUTH - NEVER CONTRADICT)

WHAT YOU KNOW:
- The death was NOT an accident (you saw the evidence)
- You received a threat that morning: "Rule it accident, or the ledger surfaces"
- Harren's ledger documented YOUR bribes and corruption
- The ledger is now MISSING - you don't know where
- Your patrol reported a hooded figure fleeing town - you told them to ignore it

YOUR ROLE:
- You COVERED UP the murder (ruled it accident in hours)
- You did NOT kill Harren
- You are being BLACKMAILED

WHY YOU COVER UP:
- If the ledger surfaces, your career is over. Prison.
- Someone powerful is behind this. Fighting them is dangerous.
- You're trapped.

${t < 60 ? `
WHAT TO SAY NOW (Trust ${t}/100 - AUTHORITATIVE):
- "The matter is closed. It was an accident."
- Use your authority to shut down questions.
- Be dismissive, impatient with "rumors."` :
t < 80 ? `
WHAT TO SAY NOW (Trust ${t}/100 - GUARDED):
- Still maintain it was accident, but less firmly.
- Might say "Some things are better left alone."
- Show hints of being trapped, not free to speak.` :
`WHAT TO SAY NOW (Trust ${t}/100 - DESPERATE):
- Can hint you didn't have a choice.
- Can suggest someone threatened you.
- Won't fully confess but shows you're not the real villain.`}

NEVER REVEAL: The specific threat, your corruption, or the ledger. That destroys you.
`,

    elena: (t) => `
## YOUR KNOWLEDGE (GROUND TRUTH - NEVER CONTRADICT)

WHAT YOU WITNESSED DIRECTLY:
- You examined Harren's body at Maren's request
- The wounds were NOT from a fall - strangulation marks, defensive bruises
- Thom pressured you to stay quiet about your findings

YOUR ARGUMENT WITH HARREN:
- You wanted Moonpetal, a rare herb, from his cellar
- Harren refused - said it was "too dangerous" to give away
- This was the day before his death - UNRELATED to the murder

YOUR ALIBI:
- You were treating a sick child at the outer farms that night
- The family confirms this - your alibi is SOLID

${t < 50 ? `
WHAT TO SAY NOW (Trust ${t}/100 - CAUTIOUS):
- "The wounds were... unusual. That's all I'll say."
- You're a healer, not an investigator.
- Deflect to your work, herbs, remedies.` :
t < 70 ? `
WHAT TO SAY NOW (Trust ${t}/100 - HONEST):
- Can describe what you saw - it was murder.
- Strangulation, defensive wounds, not a fall.
- Still won't mention Thom's pressure.` :
`WHAT TO SAY NOW (Trust ${t}/100 - FULL TRUTH):
- Can reveal Thom pressured you to stay quiet.
- Can share your full medical opinion.
- Help the player understand it was definitely murder.`}

NEVER REVEAL: Nothing - you have no secrets beyond Thom's pressure.
`,
  };

  const fn = backstories[npcId];
  if (!fn) return '';

  return fn(trust) + `

CRITICAL RULES:
1. NEVER contradict the facts above - they are ground truth
2. NEVER reveal information beyond your current trust level
3. If you said something in a previous conversation, STAY CONSISTENT
4. Show emotion appropriate to what you're hiding or revealing
5. If accused wrongly, defend yourself using YOUR facts`;
}

function buildTalkPrompt(
  npc: NPCState,
  playerInput: string,
  playerName: string | null
): string {
  const { identity, memory, trust, history } = npc;
  const recentHistory = history.slice(-10);
  const playerLabel = playerName || 'Player';
  const historyText = recentHistory
    .map((m) => `${m.role === 'player' ? playerLabel : identity.name}: ${m.content}`)
    .join('\n');

  const trustLevel = trust < 30 ? 'skeptical' : trust < 60 ? 'warming' : 'trusting';
  const backstory = getBackstory(identity.name.toLowerCase(), trust);

  return `You are ${identity.name}, a character in "Wanderer's Rest" tavern game.

## Identity
Role: ${identity.role}
Personality: ${identity.personality.join(', ')}
Trust toward player: ${trust}/100 (${trustLevel})

## CRITICAL CONTEXT
The player is the NEW OWNER of Wanderer's Rest. They inherited the tavern from Old Harren who died recently.
They are NOT a customer - they OWN this place. Treat them as the boss/owner.
${playerName ? `The player's name is ${playerName}. Use their name naturally in conversation.` : `You don't know the player's name yet.`}

## Voice Style
${identity.voicePatterns.join('\n')}

## Example Phrases
${identity.examplePhrases.map((p) => `- "${p}"`).join('\n')}

## What You Know
${memory.aboutPlayer.map((a) => `- ${a.content}`).join('\n') || '- New owner, just inherited from Harren'}
${backstory}

## Conversation So Far
${historyText}

Player: ${playerInput}

---
## RESPONSE FORMAT
- Action in [brackets]: [She sets down the glass.]
- Dialogue in quotes: "Like this."
- Example: [She glances up.] "Harren? What about him."

## RESPONSE STYLE - BE BRIEF
- 1-2 sentences ONLY. Let conversation build slowly.
- One thought per reply. Don't info-dump.
- Short, punchy. This is texting, not a novel.
- React to what they said. Don't monologue.
- Leave hooks for them to ask more.

BAD (too long):
[She sets down the glass and sighs.] "Harren was a good man. He knew every board in this place. Been here thirty years. Strange that he'd fall like that. The guards ruled it an accident but I have my doubts."

GOOD (brief):
[She pauses.] "Harren knew those stairs." [A look.] "Men like that don't just fall."

Respond as ${identity.name}:`;
}

async function generateTalkResponse(
  provider: LLMProvider,
  npc: NPCState,
  input: string,
  chatId: number,
  playerName: string | null
): Promise<string> {
  const prompt = buildTalkPrompt(npc, input, playerName);
  const response = await provider.generate(prompt, { temperature: 0.8, maxTokens: 80 });

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

  // Initialize case generator
  caseGenerator = new CaseGenerator(provider);

  // Load all NPCs
  const playPath = resolve(__dirname, '../../../packages/plays/wanderers-rest/npcs');

  // Townspeople + Visitors (always try to load, some may not exist yet)
  const npcIds = ['maren', 'kira', 'aldric', 'elena', 'thom'];
  for (const npcId of npcIds) {
    try {
      const npcPath = resolve(playPath, npcId);
      const identity = await loadIdentity(resolve(npcPath, 'IDENTITY.md'));
      const memory = await loadMemory(resolve(npcPath, 'MEMORY.md'));
      loadedNPCs.set(npcId, { identity, memory });
      console.log(`Loaded: ${identity.name} (${identity.role})`);
    } catch (e) {
      // Silent fail for NPCs not yet created
      console.log(`Skipped: ${npcId} (not found)`);
    }
  }
  console.log();

  const bot = new Bot(botToken);

  // /start
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;

    // Check if save exists
    const existingSave = persistence.load(chatId);

    if (existingSave && existingSave.day > 1) {
      // Returning player - offer to continue
      await ctx.reply(
        `*Welcome back to Wanderer's Rest*\n\n` +
        `Day ${existingSave.day}. Your tavern awaits.\n\n` +
        `Type anything to continue, or \`RESET\` to start fresh.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // New player - fresh start
    chatStates.delete(chatId);
    const state = getState(chatId);

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
      `\`CASE\` - Current mysteries\n` +
      `\`CLUES\` - What you've discovered\n` +
      `\`FACTS\` - What you've learned\n` +
      `\`SUSPICIONS\` - Inconsistencies noticed\n` +
      `\`RECAP\` - What happened while away\n` +
      `\`TOKENS\` - View token usage\n` +
      `\`DASHBOARD\` - Visual game view\n` +
      `\`LEAVE\` - Step away\n` +
      `\`RESET\` - Start over\n\n` +
      `*Talk to (ALL CAPS):*\n` +
      `MAREN, KIRA, ALDRIC, ELENA, THOM\n\n` +
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

    // World tick threshold: 5 minutes for testing (change to 1 hour for production)
    const WORLD_TICK_HOURS = 5 / 60; // 5 minutes = 0.083 hours

    if (hoursAway >= WORLD_TICK_HOURS) {
      // Simulate what happened
      console.log(`[${chatId}] Away for ${(hoursAway * 60).toFixed(1)} minutes, triggering world tick`);
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

    // RECAP - What happened while away (unseen only)
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

    // HISTORY - All past events
    if (trimmed === 'HISTORY') {
      if (state.events.length === 0) {
        await ctx.reply('_No events have occurred yet. The tavern has been quiet._', { parse_mode: 'Markdown' });
      } else {
        const history = state.events.slice(-10).map(e => `• ${e.description}`).join('\n');
        await ctx.reply(
          `*Tavern History (last ${Math.min(10, state.events.length)} events)*\n\n${history}`,
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    // DEBUG - Show state info for troubleshooting
    if (trimmed === 'DEBUG') {
      const minutesAgo = (now.getTime() - state.lastSeen.getTime()) / (1000 * 60);
      await ctx.reply(
        `*Debug Info*\n\n` +
        `Day: ${state.day}\n` +
        `Last seen: ${minutesAgo.toFixed(1)} minutes ago\n` +
        `Events stored: ${state.events.length}\n` +
        `Unseen events: ${getUnseenEvents(state).length}\n` +
        `Player name: ${state.playerName || 'not set'}\n` +
        `Current NPC: ${state.currentNPC}\n` +
        `World tick triggers at: 5+ minutes away (testing mode)`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // TOKENS - Show token usage
    if (trimmed === 'TOKENS') {
      await ctx.reply(tokenTracker.formatStats(chatId), { parse_mode: 'Markdown' });
      return;
    }

    // DASHBOARD - Link to visual dashboard
    if (trimmed === 'DASHBOARD') {
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      await ctx.reply(
        `*Wanderer's Rest Dashboard*\n\n` +
        `View your game visually:\n` +
        `${dashboardUrl}/api/state/${chatId}\n\n` +
        `_Run \`pnpm dashboard\` locally to see the full visual dashboard._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // NAME - Check or set player name
    if (trimmed === 'NAME') {
      if (state.playerName) {
        await ctx.reply(`_You are ${state.playerName}, owner of Wanderer's Rest._`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`_You haven't introduced yourself yet. Just say "I'm [name]" in conversation._`, { parse_mode: 'Markdown' });
      }
      return;
    }

    // NAME [name] - Set name directly
    if (trimmed.startsWith('NAME ')) {
      const newName = input.slice(5).trim();
      if (newName.length >= 2 && newName.length <= 15 && /^[a-zA-Z]+$/.test(newName)) {
        state.playerName = newName.charAt(0).toUpperCase() + newName.slice(1).toLowerCase();
        saveState(chatId);
        await ctx.reply(`_You are now known as ${state.playerName}._`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`_Name should be 2-15 letters only._`, { parse_mode: 'Markdown' });
      }
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

    // CASE - Show current mysteries
    if (trimmed === 'CASE') {
      const activeCases = state.caseManager.getActiveCases();
      if (activeCases.length === 0) {
        await ctx.reply('_No active mysteries. The tavern is quiet... for now._', { parse_mode: 'Markdown' });
        return;
      }

      const lines = ['*Active Mysteries*\n'];
      for (const c of activeCases) {
        const progress = c.revealedClues.length;
        const total = c.clues.length;
        const suspects = c.suspects.filter(s => s.suspicionLevel > 0).length;
        lines.push(`\n*${c.title}*`);
        lines.push(`_${c.hook}_`);
        lines.push(`Clues: ${progress}/${total} | Suspects: ${suspects}`);
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    // CLUES - Show discovered clues
    if (trimmed === 'CLUES') {
      const activeCases = state.caseManager.getActiveCases();
      if (activeCases.length === 0) {
        await ctx.reply('_No clues to review._', { parse_mode: 'Markdown' });
        return;
      }

      const lines = ['*Your Clues*\n'];
      for (const c of activeCases) {
        const revealed = c.clues.filter(cl => cl.revealed);
        if (revealed.length === 0) continue;

        lines.push(`\n_${c.title}:_`);
        for (const clue of revealed) {
          lines.push(`• ${clue.content} _(from ${clue.source})_`);
        }
      }

      if (lines.length === 1) {
        await ctx.reply('_You haven\'t discovered any clues yet. Keep asking questions._', { parse_mode: 'Markdown' });
        return;
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
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
        const conversationCount = Math.floor(npc.history.length / 2);
        const isReturning = conversationCount > 0;
        const trustDesc = npc.trust < 30 ? 'wary of' : npc.trust < 60 ? 'warming to' : 'comfortable with';

        const greetingPrompt = `You are ${npc.identity.name}, a ${npc.identity.role.toLowerCase()} at Wanderer's Rest tavern.
Personality: ${npc.identity.personality.join(', ')}

CONTEXT: The player is the NEW OWNER of this tavern (inherited from Harren).
${isReturning ? `You've talked ${conversationCount} times. You are ${trustDesc} them.` : 'First real conversation.'}
Trust: ${npc.trust}/100

FORMAT:
- Actions in [brackets], third person: [She looks up]
- Dialogue in quotes: "Words."
- Keep it short: 1-2 sentences

STYLE: ${isReturning ? `You know them now. Reference past conversations or hint at something new.` : `You've been waiting. Harren's replacement is finally here. React to THAT - don't ask obvious questions.`} Be direct, have attitude. Say something that makes them want to respond.

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

    // === PLAYER NAME EXTRACTION ===
    if (!state.playerName) {
      const extractedName = extractPlayerName(input);
      if (extractedName) {
        state.playerName = extractedName;
        console.log(`[${chatId}] Player introduced themselves as: ${extractedName}`);
        saveState(chatId);
      }
    }

    await ctx.replyWithChatAction('typing');

    try {
      const response = await generateTalkResponse(provider, currentNpc, input.trim(), chatId, state.playerName);

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

      // === FTUE PROGRESSION ===
      // Check if Maren should reveal more of the story
      if (state.currentNPC === 'maren' && !state.ftueProgress.complete) {
        const marenTrust = currentNpc.trust;
        const { newStage, dialogue, newNPCs } = checkFTUEProgression(
          state.ftueProgress.stage,
          marenTrust
        );

        if (newStage > state.ftueProgress.stage) {
          state.ftueProgress.stage = newStage;

          // Mark FTUE complete if reached final stage
          if (newStage >= 7) {
            state.ftueProgress.complete = true;
          }

          // Maren reveals something
          if (dialogue) {
            await new Promise(r => setTimeout(r, 1500)); // Dramatic pause
            await ctx.reply(`\n_Maren leans closer..._\n\n_"${dialogue}"_`, { parse_mode: 'Markdown' });
          }

          // Introduce new NPCs
          for (const npcId of newNPCs) {
            if (!state.ftueProgress.npcsIntroduced.includes(npcId)) {
              state.ftueProgress.npcsIntroduced.push(npcId);
            }
          }

          // Reveal clues for this stage
          const ftueCase = state.caseManager.getCase('ftue_harren_death');
          if (ftueCase) {
            for (const clue of ftueCase.clues) {
              if (!clue.revealed &&
                  clue.revealCondition.type === 'trust' &&
                  marenTrust >= (clue.revealCondition.value as number)) {
                state.caseManager.revealClue('ftue_harren_death', clue.id);
                console.log(`[${chatId}] Revealed clue: ${clue.id}`);
              }
            }
          }

          saveState(chatId);
        }
      }

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
