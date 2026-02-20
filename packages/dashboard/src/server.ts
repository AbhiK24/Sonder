#!/usr/bin/env node
/**
 * Sonder Dashboard Server
 *
 * Unified server for dashboard + setup wizard.
 * Run: pnpm dashboard
 */

import express from 'express';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const assetsDir = resolve(__dirname, '../assets');
const rootDir = resolve(__dirname, '../../..');
const envPath = resolve(rootDir, '.env');

// Load .env
config({ path: envPath });

// Save directory
const saveDir = process.env.SAVE_PATH?.replace('~', process.env.HOME || '') ||
  resolve(process.env.HOME || '', '.sonder/saves');

// =============================================================================
// Types
// =============================================================================

interface DashboardState {
  day: number;
  npcs: Array<{ id: string; name: string; role: string; trust: number; historyLength: number }>;
  cases: any[];
  facts: any[];
  tokens: { total: number; chat: number; worldTick: number; voices: number; router: number };
  events: any[];
  lastSeen: string;
}

interface ICSFeed {
  id: string;
  name: string;
  url: string;
}

interface SonderConfig {
  play?: string;
  llmProvider?: string;
  llmApiKey?: string;
  telegramToken?: string;
  resendApiKey?: string;
  emailDomain?: string;
  userEmail?: string;
  twilioSid?: string;
  twilioToken?: string;
  twilioWhatsApp?: string;
  userWhatsApp?: string;
  todoistApiKey?: string;
  timezone?: string;
  icsFeeds?: ICSFeed[];
}

// =============================================================================
// Config Management
// =============================================================================

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

function getCurrentConfig(): SonderConfig {
  let icsFeeds: ICSFeed[] | undefined;
  const icsFeedsJson = getEnvValue('ICS_FEEDS');
  if (icsFeedsJson) {
    try { icsFeeds = JSON.parse(icsFeedsJson); } catch (e) {}
  }

  return {
    play: getEnvValue('PLAY') || undefined,
    llmProvider: getEnvValue('LLM_PROVIDER') || undefined,
    llmApiKey: getEnvValue('KIMI_API_KEY') || getEnvValue('OPENAI_API_KEY') || getEnvValue('ANTHROPIC_API_KEY') || undefined,
    telegramToken: getEnvValue('CHORUS_TELEGRAM_BOT_TOKEN') || getEnvValue('WANDERERS_REST_TELEGRAM_BOT_TOKEN') || getEnvValue('TELEGRAM_BOT_TOKEN') || undefined,
    resendApiKey: getEnvValue('RESEND_API_KEY') || undefined,
    emailDomain: getEnvValue('SONDER_EMAIL_DOMAIN') || undefined,
    userEmail: getEnvValue('USER_EMAIL') || undefined,
    twilioSid: getEnvValue('TWILIO_ACCOUNT_SID') || undefined,
    twilioToken: getEnvValue('TWILIO_AUTH_TOKEN') || undefined,
    twilioWhatsApp: getEnvValue('TWILIO_WHATSAPP_NUMBER') || undefined,
    userWhatsApp: getEnvValue('USER_WHATSAPP') || undefined,
    todoistApiKey: getEnvValue('TODOIST_API_KEY') || undefined,
    timezone: getEnvValue('TIMEZONE') || 'UTC',
    icsFeeds,
  };
}

function saveToEnv(key: string, value: string): void {
  let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }
  writeFileSync(envPath, envContent);
  process.env[key] = value;
}

// =============================================================================
// Dashboard Helpers
// =============================================================================

function loadChatState(chatId: number): DashboardState | null {
  const savePath = resolve(saveDir, `chat_${chatId}.json`);
  if (!existsSync(savePath)) return null;

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
      tokens: { total: 0, chat: 0, worldTick: 0, voices: 0, router: 0 },
      events: data.events || [],
      lastSeen: data.lastSeen || new Date().toISOString(),
    };
  } catch (error) {
    return null;
  }
}

function getNPCRole(id: string): string {
  const roles: Record<string, string> = {
    maren: 'Barkeep', kira: 'Merchant', aldric: 'Blacksmith',
    elena: 'Herbalist', thom: 'Guard Captain', hooded: 'Unknown',
  };
  return roles[id] || 'Unknown';
}

function listSavedChats(): number[] {
  if (!existsSync(saveDir)) return [];
  return readdirSync(saveDir)
    .filter(f => f.startsWith('chat_') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('chat_', '').replace('.json', '')))
    .filter(n => !isNaN(n));
}

// =============================================================================
// Play Definitions
// =============================================================================

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

// =============================================================================
// Express App
// =============================================================================

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));
app.use('/assets', express.static(assetsDir));

// --- Health Check ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Version & Updates ---

const PACKAGE_JSON_PATH = resolve(rootDir, 'package.json');

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

app.get('/api/version', async (req, res) => {
  const currentVersion = getVersion();

  // Check GitHub for latest
  try {
    const response = await fetch('https://api.github.com/repos/AbhiK24/Sonder/releases/latest', {
      headers: { 'User-Agent': 'Sonder-Dashboard' },
    });

    if (response.ok) {
      const data = await response.json() as any;
      const latestVersion = data.tag_name?.replace(/^v/, '') || currentVersion;
      const hasUpdate = latestVersion !== currentVersion;

      res.json({
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseUrl: data.html_url,
        releaseNotes: data.body?.slice(0, 500),
        publishedAt: data.published_at,
      });
    } else {
      res.json({ currentVersion, latestVersion: currentVersion, hasUpdate: false });
    }
  } catch {
    res.json({ currentVersion, latestVersion: currentVersion, hasUpdate: false });
  }
});

// --- Dashboard APIs ---

app.get('/api/games', (req, res) => {
  res.json({ games: listSavedChats() });
});

app.get('/api/state/:chatId', (req, res) => {
  const chatId = parseInt(req.params.chatId);
  if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid chat ID' });
  const state = loadChatState(chatId);
  if (!state) return res.status(404).json({ error: 'Game not found' });
  res.json(state);
});

app.get('/api/state', (req, res) => {
  const chatIds = listSavedChats();
  if (chatIds.length === 0) return res.json({ day: 1, npcs: [], cases: [], facts: [], tokens: {}, events: [], lastSeen: new Date().toISOString() });
  res.json(loadChatState(chatIds[0]) || {});
});

app.get('/api/plays', (req, res) => res.json({ plays: PLAYS }));
app.get('/api/plays/:playId', (req, res) => {
  const play = PLAYS.find(p => p.id === req.params.playId);
  if (!play) return res.status(404).json({ error: 'Play not found' });
  res.json(play);
});

// --- Config APIs (from onboarding) ---

app.get('/api/config', (req, res) => {
  const cfg = getCurrentConfig();
  const masked = { ...cfg };
  if (masked.llmApiKey) masked.llmApiKey = '***configured***';
  if (masked.telegramToken) masked.telegramToken = '***configured***';
  if (masked.resendApiKey) masked.resendApiKey = '***configured***';
  if (masked.twilioToken) masked.twilioToken = '***configured***';
  if (masked.todoistApiKey) masked.todoistApiKey = '***configured***';
  res.json(masked);
});

app.post('/api/config', (req, res) => {
  const updates = req.body as Record<string, unknown>;
  const keyMap: Record<string, string> = {
    play: 'PLAY', llmProvider: 'LLM_PROVIDER',
    kimiApiKey: 'KIMI_API_KEY', openaiApiKey: 'OPENAI_API_KEY', anthropicApiKey: 'ANTHROPIC_API_KEY',
    chorusTelegramToken: 'CHORUS_TELEGRAM_BOT_TOKEN', wanderersRestTelegramToken: 'WANDERERS_REST_TELEGRAM_BOT_TOKEN',
    resendApiKey: 'RESEND_API_KEY', emailDomain: 'SONDER_EMAIL_DOMAIN', userEmail: 'USER_EMAIL',
    twilioSid: 'TWILIO_ACCOUNT_SID', twilioToken: 'TWILIO_AUTH_TOKEN',
    twilioWhatsApp: 'TWILIO_WHATSAPP_NUMBER', userWhatsApp: 'USER_WHATSAPP',
    todoistApiKey: 'TODOIST_API_KEY', timezone: 'TIMEZONE',
  };
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'icsFeeds' && Array.isArray(value)) {
      saveToEnv('ICS_FEEDS', JSON.stringify(value));
      continue;
    }
    const envKey = keyMap[key];
    if (envKey && typeof value === 'string' && value) saveToEnv(envKey, value);
  }
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  const cfg = getCurrentConfig();
  res.json({
    isFirstRun: !cfg.llmProvider || !cfg.telegramToken,
    hasLLM: !!cfg.llmProvider && !!cfg.llmApiKey,
    hasTelegram: !!cfg.telegramToken,
    hasEmail: !!cfg.resendApiKey,
    hasWhatsApp: !!cfg.twilioSid,
    hasTodoist: !!cfg.todoistApiKey,
  });
});

// --- Test APIs ---

app.post('/api/test/llm', async (req, res) => {
  const { provider, apiKey } = req.body;
  try {
    let endpoint = '', headers: Record<string, string> = {}, body = {};
    if (provider === 'kimi') {
      endpoint = 'https://api.moonshot.ai/v1/chat/completions';
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      body = { model: 'moonshot-v1-8k', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
    } else if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      body = { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
    } else if (provider === 'anthropic') {
      endpoint = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
      body = { model: 'claude-3-haiku-20240307', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
    } else {
      return res.json({ success: true, message: 'Ollama - assuming local setup works' });
    }
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    res.json(response.ok ? { success: true, message: 'Connection successful!' } : { success: false, message: `API error: ${response.status}` });
  } catch (error) {
    res.json({ success: false, message: error instanceof Error ? error.message : 'Connection failed' });
  }
});

app.post('/api/test/telegram', async (req, res) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${req.body.token}/getMe`);
    const data = await response.json() as any;
    res.json(data.ok ? { success: true, message: `Bot found: @${data.result.username}` } : { success: false, message: data.description || 'Invalid token' });
  } catch { res.json({ success: false, message: 'Connection failed' }); }
});

app.post('/api/test/resend', async (req, res) => {
  try {
    const response = await fetch('https://api.resend.com/domains', { headers: { 'Authorization': `Bearer ${req.body.apiKey}` } });
    res.json(response.ok ? { success: true, message: 'Resend connected!' } : { success: false, message: 'Invalid API key' });
  } catch { res.json({ success: false, message: 'Connection failed' }); }
});

app.post('/api/test/twilio', async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, { headers: { 'Authorization': `Basic ${auth}` } });
    res.json(response.ok ? { success: true, message: 'Twilio connected!' } : { success: false, message: 'Invalid credentials' });
  } catch { res.json({ success: false, message: 'Connection failed' }); }
});

app.post('/api/test/todoist', async (req, res) => {
  try {
    const response = await fetch('https://api.todoist.com/rest/v2/projects', { headers: { 'Authorization': `Bearer ${req.body.apiKey}` } });
    res.json(response.ok ? { success: true, message: 'Todoist connected!' } : { success: false, message: 'Invalid API key' });
  } catch { res.json({ success: false, message: 'Connection failed' }); }
});

app.post('/api/test/ics', async (req, res) => {
  try {
    const response = await fetch(req.body.url, { headers: { 'Accept': 'text/calendar' } });
    if (!response.ok) return res.json({ success: false, message: `HTTP ${response.status}` });
    const text = await response.text();
    if (text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR')) {
      const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
      res.json({ success: true, message: `Found ${eventCount} events` });
    } else {
      res.json({ success: false, message: 'Not a valid ICS feed' });
    }
  } catch (error) {
    res.json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch' });
  }
});

// --- Launch API ---

app.post('/api/launch', (req, res) => {
  const { play } = req.body;
  const playCommand = play === 'chorus' ? 'chorus' : 'wanderers-rest';
  const child = spawn('pnpm', ['--filter', '@sonder/engine', playCommand], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  res.json({ success: true, message: `Launching ${play}...` });
});

// =============================================================================
// Start Server
// =============================================================================

const PORT = parseInt(process.env.DASHBOARD_PORT || '3000');

app.listen(PORT, () => {
  console.log(`\n🎭 Sonder Dashboard`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   /            - Dashboard home`);
  console.log(`   /setup.html  - Setup wizard`);
  console.log(`   Sessions: ${listSavedChats().length}\n`);
});
