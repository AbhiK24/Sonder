/**
 * Integrations Module
 *
 * External service integrations for the Sonder engine.
 * Safety principle: CREATE, READ, SEND — Never DELETE.
 */

// Types
export * from './types.js';

// Adapters
export { GoogleCalendarAdapter, createCalendarAdapter } from './calendar.js';
export { TodoistAdapter, createTaskAdapter } from './tasks.js';
export { GmailAdapter, createEmailAdapter } from './email.js';
export { RSSAdapter, createContentAdapter, POPULAR_FEEDS } from './content.js';
export { WhatsAppAdapter, createWhatsAppAdapter, ANGEL_PERSONAS } from './whatsapp.js';
export type { AgentPersona, PersonalizedMessage } from './whatsapp.js';

// Outbound (multi-agent messaging)
export * from './outbound.js';

// Manager
export { IntegrationHub, getIntegrationHub } from './hub.js';
