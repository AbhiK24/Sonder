/**
 * WhatsApp Integration (via Twilio)
 *
 * Send messages to users via WhatsApp.
 * Supports multi-agent messaging (one number, many personas).
 */

import {
  MessagingAdapter,
  OutgoingMessage,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus
} from './types.js';

// =============================================================================
// Agent Persona (for multi-agent messaging)
// =============================================================================

export interface AgentPersona {
  id: string;
  name: string;
  emoji?: string;  // Optional emoji prefix
  signature?: string;  // Optional signature line
}

export interface PersonalizedMessage extends OutgoingMessage {
  agentId?: string;  // Which agent is sending
}

// =============================================================================
// WhatsApp Adapter (Twilio)
// =============================================================================

export class WhatsAppAdapter implements MessagingAdapter {
  type = 'whatsapp' as const;
  status: IntegrationStatus = 'disconnected';

  private accountSid: string | null = null;
  private authToken: string | null = null;
  private fromNumber: string | null = null;  // Twilio WhatsApp number

  private personas: Map<string, AgentPersona> = new Map();

  private static readonly API_BASE = 'https://api.twilio.com/2010-04-01';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    try {
      this.status = 'connecting';

      const { metadata } = credentials;

      if (!metadata?.accountSid || !metadata?.authToken || !metadata?.whatsappNumber) {
        this.status = 'error';
        return {
          success: false,
          error: 'Missing Twilio credentials. Need: accountSid, authToken, whatsappNumber'
        };
      }

      this.accountSid = metadata.accountSid as string;
      this.authToken = metadata.authToken as string;
      this.fromNumber = metadata.whatsappNumber as string;

      // Verify credentials
      const check = await this.healthCheck();
      if (!check.success) {
        this.status = 'error';
        return check;
      }

      this.status = 'connected';
      return { success: true };
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async disconnect(): Promise<void> {
    this.accountSid = null;
    this.authToken = null;
    this.fromNumber = null;
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.accountSid !== null;
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    if (!this.accountSid || !this.authToken) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const response = await fetch(
        `${WhatsAppAdapter.API_BASE}/Accounts/${this.accountSid}.json`,
        {
          headers: { Authorization: `Basic ${auth}` }
        }
      );

      if (response.status === 401) {
        return { success: false, error: 'Invalid Twilio credentials' };
      }

      if (!response.ok) {
        return { success: false, error: `Twilio API error: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Persona Management
  // ---------------------------------------------------------------------------

  /**
   * Register an agent persona for multi-agent messaging
   */
  registerPersona(persona: AgentPersona): void {
    this.personas.set(persona.id, persona);
  }

  /**
   * Register multiple personas at once
   */
  registerPersonas(personas: AgentPersona[]): void {
    for (const persona of personas) {
      this.registerPersona(persona);
    }
  }

  /**
   * Get all registered personas
   */
  getPersonas(): AgentPersona[] {
    return Array.from(this.personas.values());
  }

  // ---------------------------------------------------------------------------
  // Send Operations
  // ---------------------------------------------------------------------------

  /**
   * Send a plain message (no persona)
   */
  async sendMessage(
    message: OutgoingMessage,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    return this.sendPersonalizedMessage({ ...message }, confirmed);
  }

  /**
   * Send a message as a specific agent
   */
  async sendAsAgent(
    agentId: string,
    to: string,
    content: string,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    return this.sendPersonalizedMessage({
      to,
      content,
      agentId,
    }, confirmed);
  }

  /**
   * Send a personalized message (with optional agent persona)
   */
  async sendPersonalizedMessage(
    message: PersonalizedMessage,
    confirmed: boolean
  ): Promise<IntegrationResult<{ messageId: string }>> {
    if (!confirmed) {
      return {
        success: false,
        error: 'WhatsApp send requires confirmation. Set confirmed=true after user approves.'
      };
    }

    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Format message with persona if specified
      let formattedContent = message.content;

      if (message.agentId) {
        const persona = this.personas.get(message.agentId);
        if (persona) {
          formattedContent = this.formatWithPersona(message.content, persona);
        }
      }

      // Format phone number for WhatsApp
      const toNumber = this.formatWhatsAppNumber(message.to);
      const fromNumber = this.formatWhatsAppNumber(this.fromNumber!);

      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const body = new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: formattedContent,
      });

      // Add media if present
      if (message.mediaUrl) {
        body.append('MediaUrl', message.mediaUrl);
      }

      const response = await fetch(
        `${WhatsAppAdapter.API_BASE}/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: `Twilio error: ${error.message || response.status}`
        };
      }

      const data = await response.json();
      return { success: true, data: { messageId: data.sid } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk Operations (for announcements)
  // ---------------------------------------------------------------------------

  /**
   * Send the same message to multiple recipients
   */
  async broadcast(
    recipients: string[],
    content: string,
    agentId?: string,
    confirmed: boolean = false
  ): Promise<IntegrationResult<{ sent: number; failed: number; results: Array<{ to: string; success: boolean; messageId?: string; error?: string }> }>> {
    if (!confirmed) {
      return {
        success: false,
        error: `Broadcast to ${recipients.length} recipients requires confirmation.`
      };
    }

    const results: Array<{ to: string; success: boolean; messageId?: string; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const to of recipients) {
      const result = await this.sendPersonalizedMessage({ to, content, agentId }, true);

      if (result.success) {
        sent++;
        results.push({ to, success: true, messageId: result.data?.messageId });
      } else {
        failed++;
        results.push({ to, success: false, error: result.error });
      }

      // Rate limit: Twilio allows 1 msg/sec for WhatsApp
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    return {
      success: failed === 0,
      data: { sent, failed, results }
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Format message with agent persona
   */
  private formatWithPersona(content: string, persona: AgentPersona): string {
    const parts: string[] = [];

    // Header: emoji + name
    if (persona.emoji) {
      parts.push(`${persona.emoji} *${persona.name}*`);
    } else {
      parts.push(`*${persona.name}*`);
    }

    // Empty line
    parts.push('');

    // Content
    parts.push(content);

    // Signature (optional)
    if (persona.signature) {
      parts.push('');
      parts.push(`_${persona.signature}_`);
    }

    return parts.join('\n');
  }

  /**
   * Format phone number for WhatsApp API
   */
  private formatWhatsAppNumber(number: string): string {
    // Remove any existing whatsapp: prefix
    let clean = number.replace(/^whatsapp:/i, '');

    // Remove spaces, dashes, parentheses
    clean = clean.replace(/[\s\-\(\)]/g, '');

    // Ensure + prefix
    if (!clean.startsWith('+')) {
      clean = '+' + clean;
    }

    return `whatsapp:${clean}`;
  }
}

// =============================================================================
// Default Angel Personas
// =============================================================================

export const ANGEL_PERSONAS: AgentPersona[] = [
  {
    id: 'chitralekha',
    name: 'Chitralekha',
    emoji: '📜',
    signature: 'The Rememberer',
  },
  {
    id: 'urvashi',
    name: 'Urvashi',
    emoji: '⚡',
    signature: 'The Spark',
  },
  {
    id: 'menaka',
    name: 'Menaka',
    emoji: '🎯',
    signature: 'The Strategist',
  },
  {
    id: 'rambha',
    name: 'Rambha',
    emoji: '🎉',
    signature: 'The Celebrator',
  },
  {
    id: 'tilottama',
    name: 'Tilottama',
    emoji: '🪞',
    signature: 'The Mirror',
  },
];

// =============================================================================
// Factory
// =============================================================================

export function createWhatsAppAdapter(): WhatsAppAdapter {
  const adapter = new WhatsAppAdapter();
  // Pre-register angel personas
  adapter.registerPersonas(ANGEL_PERSONAS);
  return adapter;
}
