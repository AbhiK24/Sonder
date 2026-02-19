#!/usr/bin/env node
/**
 * Wanderer's Rest Dashboard Server
 *
 * Serves the dashboard UI and provides API endpoints for game state.
 * Run: pnpm dashboard
 */

import express from 'express';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const assetsDir = resolve(__dirname, '../assets');

// Load .env
config({ path: resolve(__dirname, '../../../../.env') });

// Save directory (same as telegram bot)
const saveDir = process.env.SAVE_PATH?.replace('~', process.env.HOME || '') || './saves';

interface DashboardState {
  day: number;
  npcs: Array<{
    id: string;
    name: string;
    role: string;
    trust: number;
    historyLength: number;
  }>;
  cases: any[];
  facts: any[];
  tokens: {
    total: number;
    chat: number;
    worldTick: number;
    voices: number;
    router: number;
  };
  events: any[];
  lastSeen: string;
}

// Load saved state for a chat
function loadChatState(chatId: number): DashboardState | null {
  const savePath = resolve(saveDir, `chat_${chatId}.json`);

  if (!existsSync(savePath)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(savePath, 'utf-8'));

    return {
      day: data.day || 1,
      npcs: (data.npcs || []).map((npc: any) => ({
        id: npc.id,
        name: npc.id.charAt(0).toUpperCase() + npc.id.slice(1),
        role: getNPCRole(npc.id),
        trust: npc.trust || 0,
        historyLength: npc.history?.length || 0,
      })),
      cases: data.caseManager?.cases || [],
      facts: data.facts?.facts?.map(([id, fact]: [string, any]) => fact) || [],
      tokens: {
        total: 0,
        chat: 0,
        worldTick: 0,
        voices: 0,
        router: 0,
      },
      events: data.events || [],
      lastSeen: data.lastSeen || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error loading chat ${chatId}:`, error);
    return null;
  }
}

function getNPCRole(id: string): string {
  const roles: Record<string, string> = {
    maren: 'Barkeep',
    kira: 'Merchant',
    aldric: 'Blacksmith',
    elena: 'Herbalist',
    thom: 'Guard Captain',
    hooded: 'Unknown',
  };
  return roles[id] || 'Unknown';
}

// List all saved chats
function listSavedChats(): number[] {
  if (!existsSync(saveDir)) return [];

  return readdirSync(saveDir)
    .filter(f => f.startsWith('chat_') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('chat_', '').replace('.json', '')))
    .filter(n => !isNaN(n));
}

// Create Express app
const app = express();

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(publicDir));
app.use('/assets', express.static(assetsDir));

// API: List saved games
app.get('/api/games', (req, res) => {
  const chatIds = listSavedChats();
  res.json({ games: chatIds });
});

// API: Get state for a specific chat
app.get('/api/state/:chatId', (req, res) => {
  const chatId = parseInt(req.params.chatId);

  if (isNaN(chatId)) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  const state = loadChatState(chatId);

  if (!state) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json(state);
});

// API: Get state (auto-select first game or demo)
app.get('/api/state', (req, res) => {
  const chatIds = listSavedChats();

  if (chatIds.length === 0) {
    // Return demo data
    return res.json(getDemoData());
  }

  // Return first saved game
  const state = loadChatState(chatIds[0]);
  res.json(state || getDemoData());
});

// Play definitions
const PLAYS = [
  {
    id: 'wanderers-rest',
    name: "Wanderer's Rest",
    tagline: 'A tavern mystery where time passes without you',
    description: 'Inherit a tavern with dark secrets. Solve daily puzzles, build trust with regulars, uncover what really happened to Old Harren.',
    agents: [
      { id: 'maren', name: 'Maren', emoji: '🍺', role: 'Barkeep', bio: 'Knows everyone\'s secrets. Trusted the old owner like family.' },
      { id: 'kira', name: 'Kira', emoji: '📦', role: 'Merchant', bio: 'Travels between towns. Hears things others don\'t.' },
      { id: 'aldric', name: 'Aldric', emoji: '🔨', role: 'Blacksmith', bio: 'Strong and quiet. Owes debts he doesn\'t talk about.' },
      { id: 'elena', name: 'Elena', emoji: '🌿', role: 'Herbalist', bio: 'Heals the sick. Some say she sees things.' },
      { id: 'thom', name: 'Thom', emoji: '⚔️', role: 'Guard Captain', bio: 'Keeps the peace. But whose peace?' },
    ],
  },
  {
    id: 'chorus',
    name: 'Chorus',
    tagline: 'Your productivity ensemble',
    description: 'Five AI companions help you think, plan, do, and grow. Each with distinct personality and purpose.',
    agents: [
      { id: 'kai', name: 'Kai', emoji: '🎯', role: 'The Anchor', bio: 'Grounds you when overwhelmed. Calm, steady presence.' },
      { id: 'nova', name: 'Nova', emoji: '✨', role: 'The Spark', bio: 'Ignites momentum. Celebrates wins, nudges forward.' },
      { id: 'sage', name: 'Sage', emoji: '🌿', role: 'The Mirror', bio: 'Reflects patterns back. Asks the hard questions.' },
      { id: 'echo', name: 'Echo', emoji: '🔮', role: 'The Keeper', bio: 'Remembers everything. Connects past to present.' },
      { id: 'arc', name: 'Arc', emoji: '🌈', role: 'The Bridge', bio: 'Sees the big picture. Weaves threads together.' },
    ],
  },
];

// API: Get all plays
app.get('/api/plays', (req, res) => {
  res.json({ plays: PLAYS });
});

// API: Get specific play
app.get('/api/plays/:playId', (req, res) => {
  const play = PLAYS.find(p => p.id === req.params.playId);
  if (!play) {
    return res.status(404).json({ error: 'Play not found' });
  }
  res.json(play);
});

// Demo data
function getDemoData(): DashboardState {
  return {
    day: 1,
    npcs: [
      { id: 'maren', name: 'Maren', role: 'Barkeep', trust: 30, historyLength: 0 },
      { id: 'kira', name: 'Kira', role: 'Merchant', trust: 30, historyLength: 0 },
      { id: 'aldric', name: 'Aldric', role: 'Blacksmith', trust: 30, historyLength: 0 },
      { id: 'elena', name: 'Elena', role: 'Herbalist', trust: 30, historyLength: 0 },
      { id: 'thom', name: 'Thom', role: 'Guard Captain', trust: 30, historyLength: 0 },
      { id: 'hooded', name: 'The Hooded Figure', role: 'Unknown', trust: 0, historyLength: 0 },
    ],
    cases: [{
      id: 'ftue_harren_death',
      title: 'The Death of Old Harren',
      hook: 'They say he fell down the cellar stairs. But Maren\'s eyes tell a different story.',
      status: 'active',
      clues: [],
      revealedClues: [],
      suspects: [
        { npcId: 'aldric', suspicionLevel: 0 },
        { npcId: 'thom', suspicionLevel: 0 },
        { npcId: 'elena', suspicionLevel: 0 },
        { npcId: 'hooded', suspicionLevel: 0 },
      ],
    }],
    facts: [],
    tokens: { total: 0, chat: 0, worldTick: 0, voices: 0, router: 0 },
    events: [],
    lastSeen: new Date().toISOString(),
  };
}

// Start server
const PORT = parseInt(process.env.DASHBOARD_PORT || '3000');

app.listen(PORT, () => {
  console.log(`\n🍺 Wanderer's Rest Dashboard`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   Save directory: ${saveDir}`);
  console.log(`   Saved games: ${listSavedChats().length}\n`);
});
