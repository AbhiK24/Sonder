#!/usr/bin/env node
/**
 * Sonder Onboarding Server
 *
 * Zero-friction setup wizard for non-technical users.
 * Auto-opens browser, guides through setup, launches selected play.
 */

import express from 'express';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { config } from 'dotenv';
import { spawn, exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const rootDir = resolve(__dirname, '../../../..');
const envPath = resolve(rootDir, '.env');

// Load existing .env
config({ path: envPath });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// =============================================================================
// Config Management
// =============================================================================

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
  googleClientId?: string;
  googleClientSecret?: string;
  timezone?: string;
  icsFeeds?: ICSFeed[];
}

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

function getCurrentConfig(): SonderConfig {
  // Parse ICS feeds from env (stored as JSON)
  let icsFeeds: ICSFeed[] | undefined;
  const icsFeedsJson = getEnvValue('ICS_FEEDS');
  if (icsFeedsJson) {
    try {
      icsFeeds = JSON.parse(icsFeedsJson);
    } catch (e) {
      // Invalid JSON, ignore
    }
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
    googleClientId: getEnvValue('GOOGLE_CLIENT_ID') || undefined,
    googleClientSecret: getEnvValue('GOOGLE_CLIENT_SECRET') || undefined,
    timezone: getEnvValue('TIMEZONE') || 'UTC',
    icsFeeds,
  };
}

function saveToEnv(key: string, value: string): void {
  // Read existing .env
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  // Check if key exists
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    // Update existing
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    // Append new
    envContent += `\n${key}=${value}`;
  }

  writeFileSync(envPath, envContent);
  // Update process.env too
  process.env[key] = value;
}

// =============================================================================
// API Endpoints
// =============================================================================

// Get current config
app.get('/api/config', (req, res) => {
  const config = getCurrentConfig();
  // Mask sensitive values
  const masked = { ...config };
  if (masked.llmApiKey) masked.llmApiKey = '***configured***';
  if (masked.telegramToken) masked.telegramToken = '***configured***';
  if (masked.resendApiKey) masked.resendApiKey = '***configured***';
  if (masked.twilioToken) masked.twilioToken = '***configured***';
  if (masked.todoistApiKey) masked.todoistApiKey = '***configured***';
  if (masked.googleClientSecret) masked.googleClientSecret = '***configured***';
  res.json(masked);
});

// Save config values
app.post('/api/config', (req, res) => {
  const updates = req.body as Record<string, unknown>;

  const keyMap: Record<string, string> = {
    play: 'PLAY',
    llmProvider: 'LLM_PROVIDER',
    kimiApiKey: 'KIMI_API_KEY',
    openaiApiKey: 'OPENAI_API_KEY',
    anthropicApiKey: 'ANTHROPIC_API_KEY',
    chorusTelegramToken: 'CHORUS_TELEGRAM_BOT_TOKEN',
    wanderersRestTelegramToken: 'WANDERERS_REST_TELEGRAM_BOT_TOKEN',
    resendApiKey: 'RESEND_API_KEY',
    emailDomain: 'SONDER_EMAIL_DOMAIN',
    userEmail: 'USER_EMAIL',
    twilioSid: 'TWILIO_ACCOUNT_SID',
    twilioToken: 'TWILIO_AUTH_TOKEN',
    twilioWhatsApp: 'TWILIO_WHATSAPP_NUMBER',
    userWhatsApp: 'USER_WHATSAPP',
    todoistApiKey: 'TODOIST_API_KEY',
    googleClientId: 'GOOGLE_CLIENT_ID',
    googleClientSecret: 'GOOGLE_CLIENT_SECRET',
    timezone: 'TIMEZONE',
  };

  for (const [key, value] of Object.entries(updates)) {
    // Handle ICS feeds specially (stored as JSON)
    if (key === 'icsFeeds' && Array.isArray(value)) {
      saveToEnv('ICS_FEEDS', JSON.stringify(value));
      continue;
    }

    const envKey = keyMap[key];
    if (envKey && typeof value === 'string' && value) {
      saveToEnv(envKey, value);
    }
  }

  res.json({ success: true });
});

// Test LLM connection
app.post('/api/test/llm', async (req, res) => {
  const { provider, apiKey } = req.body;

  try {
    let endpoint = '';
    let headers: Record<string, string> = {};
    let body = {};

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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.ok) {
      res.json({ success: true, message: 'Connection successful!' });
    } else {
      const error = await response.text();
      res.json({ success: false, message: `API error: ${response.status}` });
    }
  } catch (error) {
    res.json({ success: false, message: error instanceof Error ? error.message : 'Connection failed' });
  }
});

// Test Telegram bot
app.post('/api/test/telegram', async (req, res) => {
  const { token } = req.body;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();

    if (data.ok) {
      res.json({ success: true, message: `Bot found: @${data.result.username}` });
    } else {
      res.json({ success: false, message: data.description || 'Invalid token' });
    }
  } catch (error) {
    res.json({ success: false, message: 'Connection failed' });
  }
});

// Test Resend
app.post('/api/test/resend', async (req, res) => {
  const { apiKey } = req.body;

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.ok) {
      res.json({ success: true, message: 'Resend connected!' });
    } else {
      res.json({ success: false, message: 'Invalid API key' });
    }
  } catch (error) {
    res.json({ success: false, message: 'Connection failed' });
  }
});

// Test Twilio
app.post('/api/test/twilio', async (req, res) => {
  const { accountSid, authToken } = req.body;

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (response.ok) {
      res.json({ success: true, message: 'Twilio connected!' });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.json({ success: false, message: 'Connection failed' });
  }
});

// Test Todoist
app.post('/api/test/todoist', async (req, res) => {
  const { apiKey } = req.body;

  try {
    const response = await fetch('https://api.todoist.com/rest/v2/projects', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.ok) {
      res.json({ success: true, message: 'Todoist connected!' });
    } else {
      res.json({ success: false, message: 'Invalid API key' });
    }
  } catch (error) {
    res.json({ success: false, message: 'Connection failed' });
  }
});

// Test ICS feed
app.post('/api/test/ics', async (req, res) => {
  const { url } = req.body;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'text/calendar' }
    });

    if (!response.ok) {
      return res.json({ success: false, message: `HTTP ${response.status}` });
    }

    const text = await response.text();

    // Basic ICS validation
    if (text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR')) {
      // Count events
      const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
      res.json({ success: true, message: `Found ${eventCount} events` });
    } else {
      res.json({ success: false, message: 'Not a valid ICS feed' });
    }
  } catch (error) {
    res.json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch' });
  }
});

// Launch play
app.post('/api/launch', (req, res) => {
  const { play } = req.body;

  const playCommand = play === 'chorus' ? 'chorus' : 'telegram';

  // Spawn the play process
  const child = spawn('pnpm', [playCommand], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  res.json({ success: true, message: `Launching ${play}...` });
});

// Check if first run (no .env or minimal config)
app.get('/api/status', (req, res) => {
  const config = getCurrentConfig();
  const isFirstRun = !config.llmProvider || !config.telegramToken;

  res.json({
    isFirstRun,
    hasLLM: !!config.llmProvider && !!config.llmApiKey,
    hasTelegram: !!config.telegramToken,
    hasEmail: !!config.resendApiKey,
    hasWhatsApp: !!config.twilioSid,
    hasTodoist: !!config.todoistApiKey,
    hasCalendar: !!config.googleClientId,
  });
});

// =============================================================================
// Start Server
// =============================================================================

const PORT = parseInt(process.env.ONBOARDING_PORT || '3456');

app.listen(PORT, async () => {
  console.log('');
  console.log('🎭 Sonder Setup Wizard');
  console.log(`   http://localhost:${PORT}`);
  console.log('');

  // Auto-open browser
  try {
    const open = (await import('open')).default;
    await open(`http://localhost:${PORT}`);
    console.log('   Browser opened automatically.');
  } catch (e) {
    console.log('   Open http://localhost:' + PORT + ' in your browser.');
  }

  console.log('');
});
