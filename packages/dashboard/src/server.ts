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
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
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
    googleClientId: 'GOOGLE_CLIENT_ID', googleClientSecret: 'GOOGLE_CLIENT_SECRET',
  };
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'icsFeeds' && Array.isArray(value)) {
      saveToEnv('ICS_FEEDS', JSON.stringify(value));
      continue;
    }
    // Save contacts to ~/.sonder/contacts.json
    if (key === 'contacts' && Array.isArray(value)) {
      saveContacts(value);
      continue;
    }
    const envKey = keyMap[key];
    if (envKey && typeof value === 'string' && value) saveToEnv(envKey, value);
  }
  res.json({ success: true });
});

// Save contacts from onboarding
function saveContacts(contacts: Array<{ name: string; email?: string; phone?: string; category: string; relationship?: string }>) {
  const sonderDir = resolve(process.env.HOME || '', '.sonder');
  const contactsPath = resolve(sonderDir, 'contacts.json');

  if (!existsSync(sonderDir)) {
    mkdirSync(sonderDir, { recursive: true });
  }

  // Load existing contacts
  let existing: any[] = [];
  if (existsSync(contactsPath)) {
    try {
      existing = JSON.parse(readFileSync(contactsPath, 'utf-8'));
    } catch {}
  }

  // Add new contacts (avoid duplicates by email or name)
  const now = new Date().toISOString();
  for (const contact of contacts) {
    if (!contact.name) continue;

    const isDuplicate = existing.some(c =>
      (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase()) ||
      c.name.toLowerCase() === contact.name.toLowerCase()
    );

    if (!isDuplicate) {
      existing.push({
        id: contact.email?.split('@')[0] || contact.name.toLowerCase().replace(/\s+/g, '_'),
        name: contact.name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        category: contact.category || 'friend',
        relationship: contact.relationship || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  writeFileSync(contactsPath, JSON.stringify(existing, null, 2));
}

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
// Google OAuth (Simple - YOU set up once, users just click sign in)
// =============================================================================

// You create ONE Google Cloud OAuth app. Users just click "Sign in with Google".
//
// One-time setup for you:
// 1. Go to console.cloud.google.com
// 2. Create project, enable Calendar/Gmail/Tasks APIs
// 3. Create OAuth credentials (Web application)
// 4. Add redirect URI: http://localhost:3000/auth/google/callback
// 5. Copy Client ID and Secret to .env

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.DASHBOARD_PORT || '3000'}/auth/google/callback`;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
].join(' ');

// Token storage
const sonderDir = resolve(process.env.HOME || '', '.sonder');
const googleTokenPath = resolve(sonderDir, 'google-tokens.json');

function ensureSonderDir(): void {
  if (!existsSync(sonderDir)) {
    mkdirSync(sonderDir, { recursive: true });
  }
}

function loadGoogleTokens(): any {
  try {
    if (existsSync(googleTokenPath)) {
      return JSON.parse(readFileSync(googleTokenPath, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveGoogleTokens(tokens: any): void {
  ensureSonderDir();
  writeFileSync(googleTokenPath, JSON.stringify(tokens, null, 2));
}

// Check if Google OAuth is configured
app.get('/api/auth/status', (req, res) => {
  res.json({
    googleConfigured: !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET,
  });
});

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).send(`
      <html><body style="font-family: system-ui; max-width: 500px; margin: 50px auto; padding: 20px;">
        <h2>Google OAuth Not Configured</h2>
        <p>Add these to your .env file:</p>
        <pre style="background: #f5f5f5; padding: 15px; border-radius: 8px;">
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret</pre>
        <p><a href="/setup.html">Back to Setup</a></p>
      </body></html>
    `);
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`<html><body><h1>Error</h1><p>${error}</p><a href="/setup.html">Back</a></body></html>`);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      throw new Error((err as any).error_description || 'Token exchange failed');
    }

    const tokens = await tokenRes.json() as any;

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = userRes.ok ? await userRes.json() as any : {};

    // Save tokens
    saveGoogleTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      email: user.email,
    });

    // Save email to .env
    if (user.email) {
      saveToEnv('GOOGLE_EMAIL', user.email);
      saveToEnv('USER_EMAIL', user.email);
    }

    res.send(`
      <html>
      <head><style>
        body { font-family: system-ui; max-width: 400px; margin: 80px auto; text-align: center; }
        h1 { color: #22c55e; }
        .email { background: #f3f4f6; padding: 12px 20px; border-radius: 8px; margin: 20px 0; }
      </style></head>
      <body>
        <h1>Connected!</h1>
        <div class="email">${user.email || 'Google account connected'}</div>
        <p>Sonder can now access your Calendar, Gmail, and Tasks.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<html><body><h1>Error</h1><p>${err instanceof Error ? err.message : 'Unknown'}</p><a href="/setup.html">Back</a></body></html>`);
  }
});

// Refresh token helper
async function refreshGoogleToken(): Promise<boolean> {
  const tokens = loadGoogleTokens();
  if (!tokens?.refreshToken) return false;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (res.ok) {
      const newTokens = await res.json() as any;
      saveGoogleTokens({
        ...tokens,
        accessToken: newTokens.access_token,
        expiresAt: Date.now() + (newTokens.expires_in * 1000),
      });
      return true;
    }
  } catch {}
  return false;
}

// Check Google connection status
app.get('/api/google/status', async (req, res) => {
  const tokens = loadGoogleTokens();

  if (!tokens?.accessToken) {
    return res.json({ connected: false, configured: !!GOOGLE_CLIENT_ID });
  }

  // Refresh if expired
  if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshGoogleToken();
    if (!refreshed) {
      return res.json({ connected: false, expired: true });
    }
  }

  res.json({ connected: true, email: tokens.email });
});

// Disconnect Google
app.post('/api/google/disconnect', async (req, res) => {
  const tokens = loadGoogleTokens();
  if (tokens?.accessToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, { method: 'POST' });
    } catch {}
  }
  if (existsSync(googleTokenPath)) {
    unlinkSync(googleTokenPath);
  }
  res.json({ success: true });
});

// Get Google calendars
app.get('/api/google/calendars', async (req, res) => {
  let tokens = loadGoogleTokens();
  if (!tokens?.accessToken) return res.status(401).json({ error: 'Not connected' });

  if (Date.now() > tokens.expiresAt - 60000) {
    await refreshGoogleToken();
    tokens = loadGoogleTokens();
  }

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!response.ok) throw new Error('Failed');
    const data = await response.json() as any;
    res.json({
      calendars: (data.items || []).map((c: any) => ({ id: c.id, name: c.summary, primary: c.primary || false })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

// Get upcoming events
app.get('/api/google/events', async (req, res) => {
  let tokens = loadGoogleTokens();
  if (!tokens?.accessToken) return res.status(401).json({ error: 'Not connected' });

  if (Date.now() > tokens.expiresAt - 60000) {
    await refreshGoogleToken();
    tokens = loadGoogleTokens();
  }

  try {
    const params = new URLSearchParams({
      maxResults: '10',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: new Date().toISOString(),
    });
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );
    if (!response.ok) throw new Error('Failed');
    const data = await response.json() as any;
    res.json({
      events: (data.items || []).map((e: any) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

// =============================================================================
// Start Server
// =============================================================================

const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🎭 Sonder Dashboard`);
  console.log(`   http://${HOST}:${PORT}\n`);
  console.log(`   /            - Dashboard home`);
  console.log(`   /setup.html  - Setup wizard`);
  console.log(`   Sessions: ${listSavedChats().length}\n`);
});
