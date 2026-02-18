/**
 * Outbound Messaging Hub
 *
 * Unified interface for sending messages across channels.
 * Supports multi-agent personas (one identity, many voices).
 */

import { AgentPersona } from './whatsapp.js';

// =============================================================================
// Types
// =============================================================================

export type OutboundChannel = 'whatsapp' | 'telegram' | 'email' | 'sms';

export interface OutboundConfig {
  // User's contact info
  userId: string;
  whatsapp?: string;  // Phone number
  telegram?: string;  // Chat ID
  email?: string;
  sms?: string;  // Phone number

  // Preferences
  preferredChannel: OutboundChannel;
  quietHours?: { start: number; end: number };  // 24h format
  timezone?: string;
}

export interface AgentMessage {
  agentId: string;
  content: string;
  urgent?: boolean;
  replyTo?: string;  // Context for what this is responding to
}

export interface SendResult {
  success: boolean;
  channel: OutboundChannel;
  messageId?: string;
  error?: string;
}

// =============================================================================
// Email Persona Support
// =============================================================================

/**
 * Format email with agent persona
 * Uses Gmail's "From Name" feature to show agent name
 */
export function formatEmailAsAgent(
  content: string,
  persona: AgentPersona,
  subject?: string
): { subject: string; body: string; fromName: string } {
  const emoji = persona.emoji || '✨';

  return {
    subject: subject || `${emoji} ${persona.name} has a message for you`,
    body: `${content}\n\n—\n${emoji} ${persona.name}\n${persona.signature ? `_${persona.signature}_` : ''}`,
    fromName: `${persona.name} (via Sonder)`,
  };
}

/**
 * Format WhatsApp message with agent persona
 */
export function formatWhatsAppAsAgent(
  content: string,
  persona: AgentPersona
): string {
  const emoji = persona.emoji || '✨';
  const header = `${emoji} *${persona.name}*\n`;
  const footer = persona.signature ? `\n\n_${persona.signature}_` : '';
  return `${header}\n${content}${footer}`;
}

/**
 * Format Telegram message with agent persona
 */
export function formatTelegramAsAgent(
  content: string,
  persona: AgentPersona
): string {
  const emoji = persona.emoji || '✨';
  const header = `${emoji} <b>${persona.name}</b>\n`;
  const footer = persona.signature ? `\n\n<i>${persona.signature}</i>` : '';
  return `${header}\n${content}${footer}`;
}

// =============================================================================
// Sonder Identity (Email + Phone)
// =============================================================================

/**
 * Options for Sonder's own identity
 *
 * For a proper setup, Sonder needs:
 * 1. A dedicated email address (for sending as angels)
 * 2. A WhatsApp Business number (via Twilio)
 *
 * Options:
 *
 * EMAIL OPTIONS:
 * --------------
 * A) Gmail with Send As (Free)
 *    - Create sonder@gmail.com
 *    - Use Gmail API to send
 *    - From name shows as "Chitralekha (via Sonder)"
 *
 * B) Custom Domain (Recommended)
 *    - chitralekha@angels.yourdomain.com
 *    - All aliases route to same inbox
 *    - Use SendGrid/Mailgun for sending
 *
 * C) SendGrid Domain (Easiest)
 *    - Use SendGrid's domain authentication
 *    - Send from angels@yourdomain.com
 *    - From name shows agent name
 *
 * WHATSAPP OPTIONS:
 * -----------------
 * A) Twilio WhatsApp Sandbox (Free for testing)
 *    - Limited to pre-registered numbers
 *    - Good for development
 *
 * B) Twilio WhatsApp Business (Production)
 *    - Get a dedicated WhatsApp number
 *    - $0.005-0.05 per message
 *    - Proper business profile
 *
 * C) WhatsApp Business API Direct
 *    - More complex setup
 *    - For high volume
 */

export interface SonderIdentity {
  // Email
  email: {
    address: string;  // sonder@yourdomain.com
    provider: 'gmail' | 'sendgrid' | 'mailgun' | 'smtp';
    fromName?: string;  // Default from name
  };

  // WhatsApp
  whatsapp: {
    number: string;  // +1234567890
    provider: 'twilio';
    businessName?: string;  // Shows in WhatsApp profile
  };

  // Telegram
  telegram: {
    botToken: string;
    botUsername: string;  // @SonderAngelsBot
  };
}

// =============================================================================
// Example Configs
// =============================================================================

export const EXAMPLE_SONDER_IDENTITY: SonderIdentity = {
  email: {
    address: 'angels@sonder.app',
    provider: 'sendgrid',
    fromName: 'Sonder Angels',
  },
  whatsapp: {
    number: '+14155551234',
    provider: 'twilio',
    businessName: 'Sonder Angels',
  },
  telegram: {
    botToken: 'BOT_TOKEN_HERE',
    botUsername: 'SonderAngelsBot',
  },
};

// =============================================================================
// Conversation Threading
// =============================================================================

/**
 * Track conversations so agents have context
 */
export interface ConversationThread {
  userId: string;
  channel: OutboundChannel;
  messages: ThreadMessage[];
  lastAgentId?: string;
  lastActivity: Date;
}

export interface ThreadMessage {
  id: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  agentId?: string;  // Which agent sent (for outbound)
  content: string;
}

/**
 * When user replies, route to the right agent
 */
export function determineRespondingAgent(
  thread: ConversationThread,
  incomingMessage: string
): string {
  // Simple logic: last agent who messaged continues the conversation
  // Could be enhanced with intent detection

  if (thread.lastAgentId) {
    return thread.lastAgentId;
  }

  // Default to Chitralekha (the rememberer) for new conversations
  return 'chitralekha';
}

// =============================================================================
// Quiet Hours
// =============================================================================

/**
 * Check if current time is within quiet hours
 */
export function isQuietHours(
  config: OutboundConfig,
  now: Date = new Date()
): boolean {
  if (!config.quietHours) return false;

  // TODO: Handle timezone conversion
  const hour = now.getHours();
  const { start, end } = config.quietHours;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return hour >= start || hour < end;
  }

  return hour >= start && hour < end;
}

/**
 * Get next available send time after quiet hours
 */
export function getNextSendTime(
  config: OutboundConfig,
  now: Date = new Date()
): Date {
  if (!config.quietHours || !isQuietHours(config, now)) {
    return now;
  }

  const { end } = config.quietHours;
  const next = new Date(now);

  // Set to end of quiet hours
  next.setHours(end, 0, 0, 0);

  // If that's in the past, it's tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}
