/**
 * WhatsApp Integration via Baileys
 *
 * Free, no API costs - connects directly to WhatsApp Web.
 * Requires scanning QR code once to authenticate.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { actionLog } from '../action-log.js';

/**
 * Bootstrap WhatsApp credentials from environment variable
 * This allows Railway deployments to work without QR scanning on each deploy
 */
function bootstrapCredsFromEnv(authDir: string): void {
  const credsPath = join(authDir, 'creds.json');
  const credsB64 = process.env.WHATSAPP_CREDS_B64;

  // Only write if creds don't exist and env var is set
  if (!existsSync(credsPath) && credsB64) {
    try {
      const credsJson = Buffer.from(credsB64, 'base64').toString('utf-8');
      // Validate it's valid JSON
      JSON.parse(credsJson);
      writeFileSync(credsPath, credsJson, 'utf-8');
      console.log('[WhatsApp] Bootstrapped credentials from WHATSAPP_CREDS_B64');
    } catch (error) {
      console.error('[WhatsApp] Failed to bootstrap credentials from env:', error);
    }
  }
}

export interface BaileysConfig {
  authDir?: string;           // Where to store auth state (default: .sonder/whatsapp-auth)
  printQRInTerminal?: boolean; // Show QR in terminal (default: true)
  onQR?: (qr: string) => void; // Custom QR handler (for sending to user)
  onReady?: () => void;        // Called when connected
  onMessage?: (message: IncomingMessage) => void; // Handle incoming messages
}

export interface IncomingMessage {
  from: string;           // Phone number (e.g., "919876543210@s.whatsapp.net")
  fromFormatted: string;  // Formatted (e.g., "+91 98765 43210")
  name?: string;          // Contact name if available
  text?: string;          // Text content
  isGroup: boolean;
  groupName?: string;
  timestamp: Date;
  messageId: string;
  // Media
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class BaileysWhatsAppAdapter {
  private sock: WASocket | null = null;
  private config: BaileysConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: BaileysConfig = {}) {
    this.config = {
      authDir: config.authDir || join(process.cwd(), '.sonder', 'whatsapp-auth'),
      printQRInTerminal: config.printQRInTerminal ?? true,
      ...config,
    };

    // Ensure auth directory exists
    if (!existsSync(this.config.authDir!)) {
      mkdirSync(this.config.authDir!, { recursive: true });
    }

    // Bootstrap credentials from env var (for Railway/cloud deployments)
    bootstrapCredsFromEnv(this.config.authDir!);
  }

  /**
   * Connect to WhatsApp
   */
  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir!);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll handle QR ourselves
      browser: ['Sonder', 'Chrome', '120.0.0'],
      syncFullHistory: false,
    });

    // Handle connection updates
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code for authentication
      if (qr) {
        console.log('[WhatsApp] Scan QR code to connect:');
        if (this.config.printQRInTerminal) {
          qrcode.generate(qr, { small: true });
        }
        if (this.config.onQR) {
          this.config.onQR(qr);
        }
      }

      // Connection established
      if (connection === 'open') {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('[WhatsApp] Connected!');
        if (this.config.onReady) {
          this.config.onReady();
        }
      }

      // Connection closed
      if (connection === 'close') {
        this.isConnected = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Disconnected. Status: ${statusCode}`);

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WhatsApp] Reconnecting... (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), 5000);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Logged out. Delete auth folder and re-scan QR.');
        }
      }
    });

    // Save credentials when updated
    this.sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Skip messages from self
        if (msg.key.fromMe) continue;

        const incomingMessage = this.parseMessage(msg);
        if (incomingMessage && this.config.onMessage) {
          this.config.onMessage(incomingMessage);
        }
      }
    });
  }

  /**
   * Parse incoming WhatsApp message
   */
  private parseMessage(msg: proto.IWebMessageInfo): IncomingMessage | null {
    if (!msg.message || !msg.key.remoteJid) return null;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');

    // Extract text content
    let text: string | undefined;
    if (msg.message.conversation) {
      text = msg.message.conversation;
    } else if (msg.message.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text;
    } else if (msg.message.imageMessage?.caption) {
      text = msg.message.imageMessage.caption;
    } else if (msg.message.videoMessage?.caption) {
      text = msg.message.videoMessage.caption;
    }

    // Detect media
    let hasMedia = false;
    let mediaType: IncomingMessage['mediaType'];
    if (msg.message.imageMessage) {
      hasMedia = true;
      mediaType = 'image';
    } else if (msg.message.videoMessage) {
      hasMedia = true;
      mediaType = 'video';
    } else if (msg.message.audioMessage) {
      hasMedia = true;
      mediaType = 'audio';
    } else if (msg.message.documentMessage) {
      hasMedia = true;
      mediaType = 'document';
    } else if (msg.message.stickerMessage) {
      hasMedia = true;
      mediaType = 'sticker';
    }

    return {
      from: jid,
      fromFormatted: this.formatPhoneNumber(jid),
      name: msg.pushName || undefined,
      text,
      isGroup,
      timestamp: new Date((msg.messageTimestamp as number) * 1000),
      messageId: msg.key.id || '',
      hasMedia,
      mediaType,
    };
  }

  /**
   * Format phone number for display
   */
  private formatPhoneNumber(jid: string): string {
    const number = jid.split('@')[0];
    // Add + and format
    if (number.length >= 10) {
      const country = number.slice(0, number.length - 10);
      const rest = number.slice(-10);
      return `+${country} ${rest.slice(0, 5)} ${rest.slice(5)}`;
    }
    return `+${number}`;
  }

  /**
   * Format phone number to JID
   */
  private toJid(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, text: string, userId?: string, agentName?: string): Promise<SendResult> {
    if (!this.sock || !this.isConnected) {
      return { success: false, error: 'WhatsApp not connected' };
    }

    try {
      const jid = this.toJid(to);
      const result = await this.sock.sendMessage(jid, { text });

      console.log(`[WhatsApp] ✓ Sent to ${to}: "${text.slice(0, 50)}..."`);

      // Log action
      if (userId) {
        actionLog.log({
          userId,
          action: 'whatsapp_sent',
          agent: agentName,
          details: { to, messagePreview: text.slice(0, 50) },
          success: true,
          userRequested: true,
        });
      }

      return {
        success: true,
        messageId: result?.key?.id,
      };
    } catch (error) {
      console.error('[WhatsApp] Send failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send',
      };
    }
  }

  /**
   * Send an image
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<SendResult> {
    if (!this.sock || !this.isConnected) {
      return { success: false, error: 'WhatsApp not connected' };
    }

    try {
      const jid = this.toJid(to);
      const result = await this.sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption,
      });

      return { success: true, messageId: result?.key?.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send image',
      };
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
      this.isConnected = false;
      console.log('[WhatsApp] Disconnected');
    }
  }

  /**
   * Get socket for advanced operations
   */
  getSocket(): WASocket | null {
    return this.sock;
  }
}

/**
 * Create a Baileys WhatsApp adapter
 */
export function createBaileysWhatsApp(config?: BaileysConfig): BaileysWhatsAppAdapter {
  return new BaileysWhatsAppAdapter(config);
}
