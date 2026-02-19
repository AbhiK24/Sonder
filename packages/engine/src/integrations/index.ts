/**
 * Integrations Module
 *
 * External service integrations for the Sonder engine.
 * Safety principle: CREATE, READ, SEND — Never DELETE.
 */

// Types
export * from './types.js';

// Adapters
export { GoogleCalendarAdapter, ICSFeedAdapter, createCalendarAdapter, createICSAdapter } from './calendar.js';
export { TodoistAdapter, createTaskAdapter } from './tasks.js';
export { GmailAdapter, createEmailAdapter } from './email.js';
export { RSSAdapter, createContentAdapter, POPULAR_FEEDS } from './content.js';
export {
  WhatsAppAdapter,
  createWhatsAppAdapter,
  UnifiedWhatsApp,
  createUnifiedWhatsApp,
  ANGEL_PERSONAS,
} from './whatsapp.js';
export type {
  AgentPersona,
  PersonalizedMessage,
  UnifiedWhatsAppAdapter,
  UnifiedWhatsAppConfig,
  WhatsAppIncomingMessage,
} from './whatsapp.js';

// Baileys (direct WhatsApp Web connection)
export { BaileysWhatsAppAdapter, createBaileysWhatsApp } from './whatsapp-baileys.js';
export type { BaileysConfig, IncomingMessage as BaileysIncomingMessage } from './whatsapp-baileys.js';

// Outbound (multi-agent messaging)
export * from './outbound.js';

// Manager
export { IntegrationHub, getIntegrationHub } from './hub.js';
