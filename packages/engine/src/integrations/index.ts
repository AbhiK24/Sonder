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

// Google OAuth (Calendar, Gmail, Tasks)
export { GoogleOAuth, getGoogleOAuth, createGoogleOAuth } from './google-oauth.js';
export type {
  GoogleOAuthConfig,
  GoogleTokens,
  CalendarEvent,
  GmailMessage,
  GoogleTask,
} from './google-oauth.js';

// Google Skills (high-level agent actions)
export { GoogleSkills, default as googleSkills } from './google-skills.js';
export * from './google-skills.js';

// Venues
export { VenueSkills, resolveVenue, addVenue, findVenue, getVenues, listVenuesFormatted } from './venues.js';
export type { Venue, VenueMatch } from './venues.js';

// Contacts / Friends Graph
export {
  ContactSkills,
  addContact,
  addInteraction,
  getContacts,
  getContactById,
  getContactsByCategory,
  findContact,
  findAllMatches,
  findContactWithDisambiguation,
  searchContacts,
  resolveContact,
  recordCalendarEvent,
  recordEmailSent,
  getInteractionHistory,
  getRecentInteractions,
  markContacted,
  getRecentContacts,
  extractEmails,
  extractPhones,
  formatContact,
  listContactsFormatted,
  getContactsSummary,
} from './contacts.js';
export type { Contact, ContactCategory, ContactMatch, Interaction, InteractionType, DisambiguationResult } from './contacts.js';
