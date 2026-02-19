/**
 * WhatsApp Integration
 *
 * Send messages to users via WhatsApp.
 * Supports two backends:
 * - Baileys: Free, connects directly to WhatsApp Web (scan QR once)
 * - Twilio: Paid API, more reliable for production
 *
 * Supports multi-agent messaging (one number, many personas).
 */

import {
  MessagingAdapter,
  OutgoingMessage,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus
} from './types.js';
import {
  BaileysWhatsAppAdapter,
  createBaileysWhatsApp,
  BaileysConfig,
  IncomingMessage as BaileysIncomingMessage,
} from './whatsapp-baileys.js';

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
// Unified WhatsApp Interface
// =============================================================================

/**
 * Unified WhatsApp adapter that works with either Baileys or Twilio
 */
export interface UnifiedWhatsAppAdapter {
  /** Check if connected and ready to send */
  isReady(): boolean;

  /** Send a message */
  sendMessage(to: string, content: string, agentId?: string): Promise<IntegrationResult<{ messageId?: string }>>;

  /** Send a message as a specific agent */
  sendAsAgent(
    agentId: string,
    to: string,
    content: string,
    confirmed?: boolean
  ): Promise<IntegrationResult<{ messageId?: string }>>;

  /** Disconnect */
  disconnect(): Promise<void>;
}

/**
 * Configuration for unified WhatsApp adapter
 */
export interface UnifiedWhatsAppConfig {
  /** Which backend to use */
  backend: 'baileys' | 'twilio';

  /** Baileys config (if backend === 'baileys') */
  baileys?: BaileysConfig;

  /** Twilio config (if backend === 'twilio') */
  twilio?: {
    accountSid: string;
    authToken: string;
    whatsappNumber: string;
  };

  /** Agent personas for multi-agent messaging */
  personas?: AgentPersona[];

  /** Callback for incoming messages (Baileys only) */
  onMessage?: (message: BaileysIncomingMessage) => void;

  // === Restrictions ===

  /** Allowlist of phone numbers that can receive messages. Empty = block all, undefined = allow all */
  allowlist?: string[];

  /** Max messages per hour (0 = unlimited) */
  rateLimit?: number;

  /** Require explicit confirmation for each send */
  requireConfirmation?: boolean;

  /** Callback when a send is blocked */
  onBlocked?: (to: string, reason: string) => void;
}

/**
 * Unified adapter that wraps either Baileys or Twilio
 */
export class UnifiedWhatsApp implements UnifiedWhatsAppAdapter {
  private baileys: BaileysWhatsAppAdapter | null = null;
  private twilio: WhatsAppAdapter | null = null;
  private personas: Map<string, AgentPersona> = new Map();
  private backend: 'baileys' | 'twilio';

  // Restrictions
  private allowlist: Set<string> | null = null; // null = allow all
  private rateLimit: number = 0;
  private sendTimes: number[] = []; // timestamps of recent sends

  constructor(private config: UnifiedWhatsAppConfig) {
    this.backend = config.backend;

    // Register personas
    if (config.personas) {
      for (const p of config.personas) {
        this.personas.set(p.id, p);
      }
    }

    // Setup allowlist (normalize numbers)
    if (config.allowlist !== undefined) {
      this.allowlist = new Set(config.allowlist.map(n => this.normalizeNumber(n)));
    }

    this.rateLimit = config.rateLimit || 0;
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizeNumber(number: string): string {
    return number.replace(/[\s\-\(\)]/g, '').replace(/^whatsapp:/i, '');
  }

  /**
   * Check if a number is allowed
   */
  private isAllowed(to: string): { allowed: boolean; reason?: string } {
    const normalized = this.normalizeNumber(to);

    // Check allowlist
    if (this.allowlist !== null) {
      if (this.allowlist.size === 0) {
        return { allowed: false, reason: 'Allowlist is empty - all sends blocked' };
      }
      if (!this.allowlist.has(normalized)) {
        return { allowed: false, reason: `Number ${to} not in allowlist` };
      }
    }

    // Check rate limit
    if (this.rateLimit > 0) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      this.sendTimes = this.sendTimes.filter(t => t > oneHourAgo);
      if (this.sendTimes.length >= this.rateLimit) {
        return { allowed: false, reason: `Rate limit exceeded (${this.rateLimit}/hour)` };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a successful send for rate limiting
   */
  private recordSend(): void {
    this.sendTimes.push(Date.now());
  }

  /**
   * Connect to WhatsApp
   */
  async connect(): Promise<IntegrationResult<void>> {
    if (this.backend === 'baileys') {
      this.baileys = createBaileysWhatsApp({
        ...this.config.baileys,
        onMessage: this.config.onMessage,
      });

      try {
        await this.baileys.connect();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Baileys connection failed'
        };
      }
    } else {
      // Twilio
      if (!this.config.twilio) {
        return { success: false, error: 'Twilio config required' };
      }

      this.twilio = new WhatsAppAdapter();
      if (this.config.personas) {
        this.twilio.registerPersonas(this.config.personas);
      }

      return this.twilio.connect({
        type: 'whatsapp',
        metadata: this.config.twilio,
      });
    }
  }

  isReady(): boolean {
    if (this.backend === 'baileys') {
      return this.baileys?.isReady() ?? false;
    }
    return this.twilio?.isConnected() ?? false;
  }

  async sendMessage(
    to: string,
    content: string,
    agentId?: string
  ): Promise<IntegrationResult<{ messageId?: string }>> {
    // Check restrictions
    const { allowed, reason } = this.isAllowed(to);
    if (!allowed) {
      console.log(`[WhatsApp] BLOCKED send to ${to}: ${reason}`);
      if (this.config.onBlocked) {
        this.config.onBlocked(to, reason!);
      }
      return { success: false, error: `Blocked: ${reason}` };
    }

    // Format with persona if provided
    let formattedContent = content;
    if (agentId) {
      const persona = this.personas.get(agentId);
      if (persona) {
        formattedContent = this.formatWithPersona(content, persona);
      }
    }

    let result: IntegrationResult<{ messageId?: string }>;

    if (this.backend === 'baileys') {
      if (!this.baileys?.isReady()) {
        return { success: false, error: 'Baileys not ready. Scan QR code if prompted.' };
      }
      const baileysResult = await this.baileys.sendMessage(to, formattedContent);
      result = { success: baileysResult.success, data: { messageId: baileysResult.messageId }, error: baileysResult.error };
    } else {
      if (!this.twilio?.isConnected()) {
        return { success: false, error: 'Twilio not connected' };
      }
      result = await this.twilio.sendPersonalizedMessage({ to, content, agentId }, true);
    }

    // Record send for rate limiting
    if (result.success) {
      this.recordSend();
    }

    return result;
  }

  async sendAsAgent(
    agentId: string,
    to: string,
    content: string,
    confirmed: boolean = true
  ): Promise<IntegrationResult<{ messageId?: string }>> {
    return this.sendMessage(to, content, agentId);
  }

  async disconnect(): Promise<void> {
    if (this.baileys) {
      await this.baileys.disconnect();
      this.baileys = null;
    }
    if (this.twilio) {
      await this.twilio.disconnect();
      this.twilio = null;
    }
  }

  /** Get the underlying Baileys adapter (for advanced use) */
  getBaileysAdapter(): BaileysWhatsAppAdapter | null {
    return this.baileys;
  }

  /** Get the underlying Twilio adapter (for advanced use) */
  getTwilioAdapter(): WhatsAppAdapter | null {
    return this.twilio;
  }

  private formatWithPersona(content: string, persona: AgentPersona): string {
    const parts: string[] = [];
    if (persona.emoji) {
      parts.push(`${persona.emoji} *${persona.name}*`);
    } else {
      parts.push(`*${persona.name}*`);
    }
    parts.push('');
    parts.push(content);
    if (persona.signature) {
      parts.push('');
      parts.push(`_${persona.signature}_`);
    }
    return parts.join('\n');
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a Twilio-based WhatsApp adapter (legacy)
 */
export function createWhatsAppAdapter(): WhatsAppAdapter {
  const adapter = new WhatsAppAdapter();
  // Pre-register angel personas
  adapter.registerPersonas(ANGEL_PERSONAS);
  return adapter;
}

/**
 * Create a unified WhatsApp adapter
 *
 * @example
 * // Baileys (free)
 * const wa = createUnifiedWhatsApp({
 *   backend: 'baileys',
 *   baileys: { authDir: '~/.sonder/whatsapp-auth' },
 *   personas: myAgentPersonas,
 * });
 * await wa.connect();
 *
 * // Twilio (paid)
 * const wa = createUnifiedWhatsApp({
 *   backend: 'twilio',
 *   twilio: { accountSid, authToken, whatsappNumber },
 *   personas: myAgentPersonas,
 * });
 * await wa.connect();
 */
export function createUnifiedWhatsApp(config: UnifiedWhatsAppConfig): UnifiedWhatsApp {
  return new UnifiedWhatsApp(config);
}

// Re-export Baileys types for convenience
export type { BaileysConfig, BaileysIncomingMessage as WhatsAppIncomingMessage };
