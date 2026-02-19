#!/usr/bin/env node
/**
 * Chorus Telegram Bot
 *
 * Five voices harmonizing to support your ADHD brain.
 * Run: pnpm chorus
 */

import { Bot } from 'grammy';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createProvider } from './llm/providers.js';
import { createIdleEngine, IdleEngine, AgentContext, UserContext } from './idle/index.js';
import { createInsightEngine, InsightEngine, FiredTrigger, UserDataSnapshot } from './insight/index.js';
import { ResendAdapter, createEmailAdapter } from './integrations/email.js';
import { TodoistAdapter, createTaskAdapter } from './integrations/tasks.js';
import { WhatsAppAdapter, createWhatsAppAdapter } from './integrations/whatsapp.js';
import { ICSFeedAdapter, createICSAdapter } from './integrations/calendar.js';
import type { ICSFeedConfig } from './integrations/types.js';
import { Persistence } from './utils/persistence.js';
import type { ModelConfig, LLMProvider } from './types/index.js';

// FTUE & User Profile
import { FTUERunner, createFTUEState, needsFTUE } from './ftue/index.js';
import { chorusFTUE } from './plays/chorus/ftue.js';
import type { UserProfile, Goal } from './user/types.js';
import { createUserProfile } from './user/types.js';

// Chorus play imports
import {
  agents as chorusAgents,
  agentList,
  selectAgent,
  getCheckInLead,
  ensembleIntro,
  checkInTemplates,
} from '../../plays/chorus/index.js';
import type { ChorusAgent, ChorusAgentId } from '../../plays/chorus/types.js';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  morningHour: parseInt(process.env.MORNING_CHECKIN_HOUR || '9'),
  eveningHour: parseInt(process.env.EVENING_CHECKIN_HOUR || '21'),
  quietHoursStart: parseInt(process.env.QUIET_HOURS_START || '22'),
  quietHoursEnd: parseInt(process.env.QUIET_HOURS_END || '8'),
};

// =============================================================================
// Types
// =============================================================================

interface UserState {
  id: number;
  lastAgent: ChorusAgentId;
  history: Array<{ role: 'user' | 'agent'; agentId?: ChorusAgentId; content: string; timestamp: Date }>;
  lastSeen: Date;
  sessionCount: number;
  isNewUser: boolean;
  emotionalState?: 'calm' | 'stressed' | 'overwhelmed' | 'stuck' | 'spiraling';
  taskContext?: 'planning' | 'starting' | 'working' | 'completing' | 'reflecting';
  userEmail?: string;
  userName?: string;

  // FTUE & User Profile
  profile: UserProfile;
  ftueRunner?: FTUERunner;
  inFTUE: boolean;
}

// =============================================================================
// State
// =============================================================================

const userStates = new Map<number, UserState>();

// Services
let provider: LLMProvider;
let idleEngine: IdleEngine;
let insightEngine: InsightEngine;
let emailAdapter: ResendAdapter | null = null;
let taskAdapter: TodoistAdapter | null = null;
let whatsappAdapter: WhatsAppAdapter | null = null;
let calendarAdapter: ICSFeedAdapter | null = null;
let bot: Bot;

// Persistence
const saveDir = process.env.SAVE_PATH?.replace('~', process.env.HOME || '') || resolve(process.env.HOME || '', '.sonder/saves');
const storageDir = process.env.SONDER_CONFIG_DIR?.replace('~', process.env.HOME || '') || resolve(process.env.HOME || '', '.sonder');
const persistence = new Persistence(saveDir);

// =============================================================================
// User State Management
// =============================================================================

function getState(chatId: number): UserState {
  if (!userStates.has(chatId)) {
    // Try to load from persistence
    const saved = persistence.load(chatId);

    if (saved) {
      // Load existing user
      const profile: UserProfile = saved.profile || createUserProfile(CONFIG.timezone);
      if (saved.profile) {
        // Restore dates
        profile.createdAt = new Date(profile.createdAt);
        profile.updatedAt = new Date(profile.updatedAt);
        if (profile.ftueCompletedAt) profile.ftueCompletedAt = new Date(profile.ftueCompletedAt);
        profile.goals = (profile.goals || []).map(g => ({
          ...g,
          createdAt: new Date(g.createdAt),
          targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
          lastCheckedIn: g.lastCheckedIn ? new Date(g.lastCheckedIn) : undefined,
          nextCheckIn: g.nextCheckIn ? new Date(g.nextCheckIn) : undefined,
          milestones: (g.milestones || []).map(m => ({
            ...m,
            sharedAt: new Date(m.sharedAt),
            achievedAt: m.achievedAt ? new Date(m.achievedAt) : undefined,
          })),
        }));
      }

      userStates.set(chatId, {
        id: chatId,
        lastAgent: saved.lastAgent || 'luna',
        history: saved.history || [],
        lastSeen: new Date(saved.lastSeen),
        sessionCount: saved.sessionCount || 1,
        isNewUser: false,
        emotionalState: saved.emotionalState,
        taskContext: saved.taskContext,
        userEmail: saved.userEmail,
        userName: saved.userName,
        profile,
        inFTUE: needsFTUE(profile),
      });
      console.log(`[${chatId}] Loaded save (session ${saved.sessionCount}, ftue: ${profile.ftueCompleted ? 'done' : 'pending'})`);
    } else {
      // New user - will need FTUE
      const profile = createUserProfile(CONFIG.timezone);
      userStates.set(chatId, {
        id: chatId,
        lastAgent: 'luna',
        history: [],
        lastSeen: new Date(),
        sessionCount: 1,
        isNewUser: true,
        profile,
        inFTUE: true,
      });
      console.log(`[${chatId}] New user - starting FTUE`);
    }
  }

  return userStates.get(chatId)!;
}

function saveState(chatId: number): void {
  const state = userStates.get(chatId);
  if (!state) return;

  // Update profile timestamp
  state.profile.updatedAt = new Date();

  persistence.save(chatId, {
    lastAgent: state.lastAgent,
    history: state.history.slice(-100), // Keep last 100 messages
    lastSeen: state.lastSeen.toISOString(),
    sessionCount: state.sessionCount,
    emotionalState: state.emotionalState,
    taskContext: state.taskContext,
    userEmail: state.userEmail,
    userName: state.userName,
    profile: state.profile,
  });
}

// =============================================================================
// Agent Helpers
// =============================================================================

function getAgentContext(agent: ChorusAgent): AgentContext {
  return {
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role,
    personality: agent.voiceTraits.join(', '),
    preferredTopics: agent.speaksWhen,
  };
}

function getUserContext(state: UserState, awayMinutes: number): UserContext {
  const recentHistory = state.history.slice(-20);

  return {
    userId: String(state.id),
    recentMessages: recentHistory.map(h => ({
      role: h.role,
      content: h.content,
      timestamp: h.timestamp,
    })),
    mood: state.emotionalState,
    awayMinutes,
    lastInteractionType: state.taskContext || 'general',
    facts: [], // TODO: integrate with fact store
    patterns: [], // TODO: integrate with pattern store
  };
}

// =============================================================================
// LLM Response Generation
// =============================================================================

async function generateAgentResponse(
  agent: ChorusAgent,
  userMessage: string,
  state: UserState,
  context?: { checkInType?: string; reunionContext?: string }
): Promise<string> {
  // Build context from history
  const recentHistory = state.history.slice(-10)
    .map(h => {
      if (h.role === 'agent') {
        const a = chorusAgents[h.agentId as ChorusAgentId];
        return `${a?.name || 'Agent'}: ${h.content}`;
      }
      return `User: ${h.content}`;
    })
    .join('\n');

  // Build prompt
  let systemPrompt = agent.systemPrompt;

  // Add context about other agents
  systemPrompt += `\n\n## The Chorus
You are part of a team of 5 agents who support this user together:
${agentList.map(a => `- ${a.emoji} ${a.name} (${a.role}): ${a.description}`).join('\n')}

You discuss the user with each other. You're all rooting for them.`;

  // Add check-in context if applicable
  if (context?.checkInType) {
    const template = checkInTemplates[context.checkInType as keyof typeof checkInTemplates];
    if (template) {
      systemPrompt += `\n\n## This is a ${context.checkInType} check-in
Prompt hints: ${template.promptHints.join(' | ')}`;
    }
  }

  // Add reunion context if applicable
  if (context?.reunionContext) {
    systemPrompt += `\n\n## The user just returned
${context.reunionContext}`;
  }

  // Add calendar context if available
  if (calendarAdapter) {
    try {
      const upcoming = await calendarAdapter.getUpcoming(24); // Next 24 hours
      if (upcoming.success && upcoming.data && upcoming.data.length > 0) {
        const events = upcoming.data.slice(0, 5); // Max 5 events
        const eventsList = events.map(e => {
          const time = e.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const calName = e.calendarName ? ` (${e.calendarName})` : '';
          return `- ${time}: ${e.title}${calName}`;
        }).join('\n');
        systemPrompt += `\n\n## User's Schedule (next 24h)
${eventsList}`;
      }
    } catch (e) {
      // Silently ignore calendar errors
    }
  }

  // Build conversation prompt
  const prompt = `${systemPrompt}

## Recent Conversation
${recentHistory || '(This is the start of the conversation)'}

## User's Message
${userMessage}

## Your Response
Respond as ${agent.name}. Be warm, supportive, and true to your role. Keep responses concise (1-3 sentences unless more is needed). Don't be overly effusive.`;

  try {
    const response = await provider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 300,
    });
    return response.trim();
  } catch (error) {
    console.error('[Chorus] LLM error:', error);
    return `*${agent.name} pauses thoughtfully* I'm here for you. What's on your mind?`;
  }
}

// =============================================================================
// Commands
// =============================================================================

const COMMANDS: Record<string, (chatId: number, state: UserState, args?: string) => Promise<string>> = {
  async START(chatId, state) {
    state.isNewUser = false;
    state.sessionCount++;
    saveState(chatId);
    return ensembleIntro;
  },

  async HELP(chatId, state) {
    return `**Chorus Commands**

Just chat naturally - we'll figure out who should respond.

**Switch agents:**
LUNA, EMBER, SAGE, JOY, ECHO

**Tools:**
CHECKIN - Trigger a check-in now
TESTEMAIL - Send a test email
TESTWHATSAPP - Send a test WhatsApp
STATUS - See who's here
HISTORY - Recent conversation
RESET - Start fresh

Or just talk to us. We're here. 💫`;
  },

  async STATUS(chatId, state) {
    const agent = chorusAgents[state.lastAgent];
    let status = `**Currently talking with:** ${agent.emoji} ${agent.name}\n\n`;
    status += `**The Chorus:**\n`;
    status += agentList.map(a => `${a.emoji} ${a.name} - ${a.role}`).join('\n');
    return status;
  },

  async HISTORY(chatId, state) {
    if (state.history.length === 0) {
      return "We haven't talked yet. Say hello!";
    }
    const recent = state.history.slice(-10);
    return recent.map(h => {
      if (h.role === 'agent') {
        const a = chorusAgents[h.agentId as ChorusAgentId];
        return `${a?.emoji || '🔮'} ${a?.name || 'Agent'}: ${h.content}`;
      }
      return `You: ${h.content}`;
    }).join('\n\n');
  },

  async RESET(chatId, state) {
    userStates.delete(chatId);
    persistence.delete(chatId);
    return "Fresh start. We're here when you're ready. 💫";
  },

  // Direct agent switches
  async LUNA(chatId, state) { return switchAgent(chatId, state, 'luna'); },
  async EMBER(chatId, state) { return switchAgent(chatId, state, 'ember'); },
  async SAGE(chatId, state) { return switchAgent(chatId, state, 'sage'); },
  async JOY(chatId, state) { return switchAgent(chatId, state, 'joy'); },
  async ECHO(chatId, state) { return switchAgent(chatId, state, 'echo'); },

  // Test email
  async TESTEMAIL(chatId, state) {
    if (!emailAdapter) {
      return "❌ Email not configured. Set RESEND_API_KEY in .env";
    }

    const userEmail = process.env.USER_EMAIL;
    const emailDomain = process.env.SONDER_EMAIL_DOMAIN;
    if (!userEmail) {
      return "❌ No USER_EMAIL configured in .env";
    }

    try {
      const agent = chorusAgents.luna;
      const fromAddress = emailDomain && emailDomain !== 'resend.dev'
        ? `${agent.name} <${agent.id}+chorus@${emailDomain}>`
        : `Chorus <onboarding@resend.dev>`;

      const result = await emailAdapter.sendEmail({
        from: fromAddress,
        to: [userEmail],
        subject: `${agent.emoji} ${agent.name} checking in`,
        body: `Hey there!\n\nThis is Luna from Chorus.\n\nJust checking that our communication channel is working. When we notice patterns or want to check in, we'll reach out here.\n\nWe're rooting for you.\n\n${agent.emoji} Luna\n\n---\nReply to this email to talk to me.`,
      }, true);

      if (result.success) {
        return `✅ Test email sent to ${userEmail} from ${fromAddress}!\n\nCheck your inbox.`;
      } else {
        return `❌ Failed to send: ${result.error}`;
      }
    } catch (error) {
      return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },

  // Trigger a check-in manually
  async CHECKIN(chatId, state) {
    const agent = getCheckInLead('evening');
    const response = await generateAgentResponse(agent, `(Generate a quick check-in)`, state, { checkInType: 'evening' });
    return `${agent.emoji} **${agent.name}:** ${response}`;
  },

  // Test WhatsApp
  async TESTWHATSAPP(chatId, state) {
    if (!whatsappAdapter) {
      return "❌ WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER in .env";
    }

    const userPhone = process.env.USER_WHATSAPP;
    if (!userPhone) {
      return "❌ No USER_WHATSAPP configured in .env";
    }

    try {
      const agent = chorusAgents.ember; // Ember for energy!
      const result = await whatsappAdapter.sendAsAgent(
        agent.id,
        userPhone,
        `Hey! This is a test message from Chorus.\n\nEmber here - just checking that our WhatsApp channel is working. When you need a spark to get started, I'll be here! 🔥`,
        true
      );

      if (result.success) {
        return `✅ WhatsApp sent to ${userPhone}!\n\nCheck your phone.`;
      } else {
        return `❌ Failed to send: ${result.error}`;
      }
    } catch (error) {
      return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

async function switchAgent(chatId: number, state: UserState, agentId: ChorusAgentId): Promise<string> {
  state.lastAgent = agentId;
  const agent = chorusAgents[agentId];
  saveState(chatId);

  // Generate a greeting from the agent
  return generateAgentResponse(agent, `(User switched to talking with you)`, state);
}

// =============================================================================
// FTUE Handling
// =============================================================================

/**
 * Start FTUE for a new user
 */
async function startFTUE(chatId: number, state: UserState): Promise<void> {
  console.log(`[${chatId}] Starting FTUE flow`);

  const ftueState = createFTUEState(chorusFTUE, String(chatId), state.profile);

  const runner = new FTUERunner(ftueState, {
    getAgentDisplay: (agentId: string) => {
      const agent = chorusAgents[agentId as ChorusAgentId];
      return agent
        ? { name: agent.name, emoji: agent.emoji }
        : { name: 'Luna', emoji: '🌙' };
    },
    onMessage: async (message: string, agentId: string) => {
      await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      // Small delay between messages for natural feel
      await new Promise(resolve => setTimeout(resolve, 500));
    },
  });

  state.ftueRunner = runner;
  state.inFTUE = true;

  // Start the flow
  await runner.start();
}

/**
 * Process FTUE response
 */
async function processFTUEResponse(chatId: number, state: UserState, text: string): Promise<boolean> {
  if (!state.ftueRunner || !state.inFTUE) {
    return false;
  }

  const runner = state.ftueRunner;

  if (!runner.isWaitingForResponse()) {
    return false;
  }

  // Process the user's response
  await runner.processResponse(text);

  // Check if FTUE is complete
  if (runner.isComplete()) {
    state.inFTUE = false;
    state.profile = runner.getUserProfile();
    state.ftueRunner = undefined;
    saveState(chatId);

    console.log(`[${chatId}] FTUE complete, goals: ${state.profile.goals.length}`);

    // Log goals gathered
    state.profile.goals.forEach(g => {
      console.log(`  - [${g.domain}] ${g.statement}`);
    });
  }

  return true;
}

// =============================================================================
// Message Handling
// =============================================================================

async function handleMessage(chatId: number, text: string): Promise<string> {
  const state = getState(chatId);
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  // Record activity for idle engine
  idleEngine.recordActivity(String(chatId));

  // Handle FTUE for new users
  if (state.inFTUE) {
    // Check if we need to start FTUE
    if (!state.ftueRunner) {
      await startFTUE(chatId, state);
      return ''; // Messages sent by FTUE runner
    }

    // Process FTUE response
    const handled = await processFTUEResponse(chatId, state, trimmed);
    if (handled) {
      return ''; // Messages sent by FTUE runner
    }
  }

  // Check for commands (but allow RESET even during FTUE)
  if (upper === 'RESET') {
    return COMMANDS.RESET(chatId, state);
  }

  // Check for commands (skip START for returning users)
  if (COMMANDS[upper] && upper !== 'START') {
    return COMMANDS[upper](chatId, state);
  }

  // Handle START command specially
  if (upper === 'START') {
    // If new user, start FTUE
    if (needsFTUE(state.profile)) {
      await startFTUE(chatId, state);
      return '';
    }
    // Otherwise, welcome back
    return COMMANDS.START(chatId, state);
  }

  // Check for agent name mentions (switch + respond)
  const agentMention = agentList.find(a =>
    upper.startsWith(a.name.toUpperCase()) ||
    upper.startsWith(`@${a.name.toUpperCase()}`)
  );

  if (agentMention) {
    state.lastAgent = agentMention.id;
    const actualMessage = trimmed.slice(agentMention.name.length).trim().replace(/^[,:]?\s*/, '');
    if (actualMessage) {
      return processMessage(chatId, state, actualMessage, agentMention);
    } else {
      return switchAgent(chatId, state, agentMention.id);
    }
  }

  // Auto-select agent based on context
  const selectedAgent = selectAgent({
    userMessage: trimmed,
    emotionalState: state.emotionalState,
    taskContext: state.taskContext,
  });

  return processMessage(chatId, state, trimmed, selectedAgent);
}

async function processMessage(
  chatId: number,
  state: UserState,
  message: string,
  agent: ChorusAgent
): Promise<string> {
  // Update state
  state.lastAgent = agent.id;
  state.lastSeen = new Date();

  // Add user message to history
  state.history.push({
    role: 'user',
    content: message,
    timestamp: new Date(),
  });

  // Detect emotional state from message (simple heuristics)
  const lower = message.toLowerCase();
  if (lower.includes('overwhelm') || lower.includes('too much') || lower.includes("can't handle")) {
    state.emotionalState = 'overwhelmed';
  } else if (lower.includes('stuck') || lower.includes("can't start") || lower.includes('procrastin')) {
    state.emotionalState = 'stuck';
  } else if (lower.includes('anxious') || lower.includes('stressed') || lower.includes('worried')) {
    state.emotionalState = 'stressed';
  } else if (lower.includes('spiral') || lower.includes('panic')) {
    state.emotionalState = 'spiraling';
  }

  // Generate response
  const response = await generateAgentResponse(agent, message, state);

  // Add agent response to history
  state.history.push({
    role: 'agent',
    agentId: agent.id,
    content: response,
    timestamp: new Date(),
  });

  // Save state
  saveState(chatId);

  // Format response with agent emoji
  return `${agent.emoji} **${agent.name}:** ${response}`;
}

// =============================================================================
// Proactive Messaging
// =============================================================================

async function sendProactiveMessage(chatId: number, message: string): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`[Chorus] Sent proactive message to ${chatId}`);
  } catch (error) {
    console.error(`[Chorus] Failed to send proactive message to ${chatId}:`, error);
  }
}

async function handleCheckIn(chatId: number, type: 'morning' | 'midday' | 'evening' | 'weekly'): Promise<void> {
  const state = getState(chatId);
  const leadAgent = getCheckInLead(type);
  const template = checkInTemplates[type];

  // Generate check-in message
  const prompt = template.promptHints[Math.floor(Math.random() * template.promptHints.length)];
  const response = await generateAgentResponse(leadAgent, `(Generate a ${type} check-in)`, state, { checkInType: type });

  await sendProactiveMessage(chatId, `${leadAgent.emoji} **${leadAgent.name}:** ${response}`);
}

async function handleReunion(chatId: number, awayMinutes: number, thoughts: string): Promise<void> {
  const state = getState(chatId);
  const leadAgent = chorusAgents.luna; // Luna leads reunions

  const response = await generateAgentResponse(
    leadAgent,
    `(User just returned after ${awayMinutes} minutes away)`,
    state,
    { reunionContext: thoughts }
  );

  await sendProactiveMessage(chatId, `${leadAgent.emoji} **${leadAgent.name}:** ${response}`);
}

// =============================================================================
// Engine Setup
// =============================================================================

function setupIdleEngine(): void {
  idleEngine = createIdleEngine(
    provider,
    resolve(storageDir, 'idle'),
    {
      getAgents: async (userId) => {
        return agentList.map(getAgentContext);
      },
      getUserContext: async (userId, awayMinutes) => {
        const chatId = parseInt(userId);
        const state = getState(chatId);
        return getUserContext(state, awayMinutes);
      },
      onReunion: async (payload, message) => {
        const chatId = parseInt(payload.userId);
        await handleReunion(chatId, payload.awayMinutes, message.greeting);
      },
      onThoughtGenerated: async (thought) => {
        console.log(`[IdleEngine] Generated thought for ${thought.userId}: ${thought.type}`);
      },
    }
  );

  idleEngine.start();
  console.log('[Chorus] IdleEngine started');
}

function setupInsightEngine(): void {
  insightEngine = createInsightEngine(
    provider,
    resolve(storageDir, 'insight'),
    {
      getUserData: async (userId): Promise<UserDataSnapshot> => {
        const chatId = parseInt(userId);
        const state = getState(chatId);

        return {
          userId,
          conversations: state.history.slice(-50).map(h => ({
            timestamp: h.timestamp,
            role: h.role,
            content: h.content,
          })),
          tasks: [], // TODO: integrate with Todoist
          patterns: [],
        };
      },
      isQuietHours: (userId) => {
        const now = new Date();
        const hour = now.getHours();
        return hour >= CONFIG.quietHoursStart || hour < CONFIG.quietHoursEnd;
      },
      onTriggerFired: async (fired: FiredTrigger) => {
        console.log(`[InsightEngine] Trigger fired: ${fired.trigger.name}`);

        // Handle different trigger types
        if (fired.trigger.action.type === 'check_in') {
          const checkInType = fired.trigger.action.config?.checkInType as 'morning' | 'midday' | 'evening' | 'weekly';
          if (checkInType) {
            await handleCheckIn(parseInt(fired.userId), checkInType);
          }
        } else if (fired.trigger.action.type === 'message') {
          // Generic proactive message
          const chatId = parseInt(fired.userId);
          const state = getState(chatId);
          const agent = selectAgent({ userMessage: '', emotionalState: state.emotionalState });
          const response = await generateAgentResponse(agent, `(Proactive check-in triggered)`, state);
          await sendProactiveMessage(chatId, `${agent.emoji} **${agent.name}:** ${response}`);
        }
      },
    }
  );

  // Register scheduled triggers for check-ins
  setupScheduledTriggers();

  insightEngine.start();
  console.log('[Chorus] InsightEngine started');
}

function setupScheduledTriggers(): void {
  // These will be registered per-user when they interact
  // For now, we set up the templates
  console.log('[Chorus] Check-in triggers configured:');
  console.log(`  Morning: ${CONFIG.morningHour}:00 ${CONFIG.timezone}`);
  console.log(`  Evening: ${CONFIG.eveningHour}:00 ${CONFIG.timezone}`);
}

async function setupIntegrations(): Promise<void> {
  // Email (Resend)
  const resendKey = process.env.RESEND_API_KEY;
  const emailDomain = process.env.SONDER_EMAIL_DOMAIN;

  if (resendKey && emailDomain) {
    emailAdapter = createEmailAdapter('resend') as ResendAdapter;
    const result = await emailAdapter.connect({
      type: 'resend',
      apiKey: resendKey,
      metadata: { domain: emailDomain },
    });

    if (result.success) {
      console.log('[Chorus] Email (Resend) connected');
    } else {
      console.warn('[Chorus] Email connection failed:', result.error);
      emailAdapter = null;
    }
  } else {
    console.log('[Chorus] Email not configured (set RESEND_API_KEY and SONDER_EMAIL_DOMAIN)');
  }

  // Tasks (Todoist)
  const todoistKey = process.env.TODOIST_API_KEY;

  if (todoistKey) {
    taskAdapter = createTaskAdapter('todoist') as TodoistAdapter;
    const result = await taskAdapter.connect({
      type: 'todoist',
      apiKey: todoistKey,
    });

    if (result.success) {
      console.log('[Chorus] Tasks (Todoist) connected');
    } else {
      console.warn('[Chorus] Todoist connection failed:', result.error);
      taskAdapter = null;
    }
  } else {
    console.log('[Chorus] Todoist not configured (set TODOIST_API_KEY)');
  }

  // WhatsApp (Twilio)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;

  if (twilioSid && twilioToken && twilioWhatsApp) {
    whatsappAdapter = createWhatsAppAdapter();

    // Register Chorus personas
    whatsappAdapter.registerPersonas(
      agentList.map(a => ({
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        signature: a.role,
      }))
    );

    const result = await whatsappAdapter.connect({
      type: 'whatsapp',
      metadata: {
        accountSid: twilioSid,
        authToken: twilioToken,
        whatsappNumber: twilioWhatsApp,
      },
    });

    if (result.success) {
      console.log('[Chorus] WhatsApp (Twilio) connected');
    } else {
      console.warn('[Chorus] WhatsApp connection failed:', result.error);
      whatsappAdapter = null;
    }
  } else {
    console.log('[Chorus] WhatsApp not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)');
  }

  // Calendar (ICS Feeds)
  const icsFeedsJson = process.env.ICS_FEEDS;

  if (icsFeedsJson) {
    try {
      const feeds: ICSFeedConfig[] = JSON.parse(icsFeedsJson);
      if (feeds.length > 0) {
        calendarAdapter = createICSAdapter(feeds);
        const result = await calendarAdapter.connect({
          type: 'ics_feed',
          metadata: { feeds },
        });

        if (result.success) {
          console.log(`[Chorus] Calendar connected (${feeds.length} feed${feeds.length > 1 ? 's' : ''})`);
        } else {
          console.warn('[Chorus] Calendar connection failed:', result.error);
          calendarAdapter = null;
        }
      }
    } catch (e) {
      console.warn('[Chorus] Invalid ICS_FEEDS config:', e);
    }
  } else {
    console.log('[Chorus] Calendar not configured (set ICS_FEEDS in onboarding)');
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('');
  console.log('🎵 Starting Chorus...');
  console.log('   Five voices harmonizing to support your ADHD brain.');
  console.log('');

  // Check for bot token
  const botToken = process.env.CHORUS_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('❌ No Telegram bot token found!');
    console.error('   Set CHORUS_TELEGRAM_BOT_TOKEN in your .env file');
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

  // Setup integrations
  await setupIntegrations();

  // Setup engines
  setupIdleEngine();
  setupInsightEngine();

  // Create bot
  bot = new Bot(botToken);

  // Handle messages
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    console.log(`[${chatId}] ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`);

    try {
      const response = await handleMessage(chatId, text);
      // Only reply if there's a response (FTUE sends messages directly)
      if (response) {
        await ctx.reply(response, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error(`[${chatId}] Error:`, error);
      await ctx.reply("Something went wrong. I'm still here though. Try again? 💫");
    }
  });

  // Start bot
  console.log('');
  console.log('✓ Bot starting...');

  bot.start({
    onStart: (botInfo) => {
      console.log(`✓ @${botInfo.username} is running!`);
      console.log('');
      console.log('The Chorus is ready:');
      agentList.forEach(a => console.log(`  ${a.emoji} ${a.name} - ${a.role}`));
      console.log('');
      console.log('Message the bot to start chatting.');
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down Chorus...');
    idleEngine?.stop();
    insightEngine?.stop();
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
