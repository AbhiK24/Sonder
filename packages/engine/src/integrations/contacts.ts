/**
 * Contacts / Friends Graph
 *
 * Stores and manages user's contacts with full interaction history.
 * Tracks all meetings, emails, venues - building a relationship timeline.
 * Categories: friends, family, business, acquaintance
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Types
// =============================================================================

export type ContactCategory = 'friend' | 'family' | 'business' | 'acquaintance';

export type InteractionType =
  | 'calendar_event'    // Met at a calendar event
  | 'email_sent'        // Sent them an email
  | 'email_received'    // Received email from them
  | 'whatsapp_sent'     // Sent WhatsApp message
  | 'whatsapp_received' // Received WhatsApp
  | 'call'              // Phone/video call
  | 'meeting'           // In-person meeting
  | 'introduced'        // First time user mentioned them
  | 'note';             // User added a note about them

export interface Interaction {
  id: string;
  type: InteractionType;
  date: Date;
  summary: string;           // Brief description
  venue?: string;            // Where it happened (resolved venue name)
  venueAddress?: string;     // Full address
  calendarEventId?: string;  // If from calendar
  emailSubject?: string;     // If email
  attendees?: string[];      // Other people involved
  notes?: string;            // Additional context
  agentId?: string;          // Which agent recorded this
}

export interface Contact {
  id: string;                 // Generated from name or email
  name: string;
  nickname?: string;          // Short name or alias
  email?: string;
  phone?: string;             // With country code
  category: ContactCategory;
  company?: string;
  role?: string;              // Their job title or role
  relationship?: string;      // "college friend", "client", "manager at X", etc.
  notes?: string;

  // Interaction history
  interactions: Interaction[];
  interactionCount: number;
  lastInteraction?: Date;
  firstInteraction?: Date;

  // Frequently used venues with this person
  frequentVenues?: string[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactMatch {
  contact: Contact;
  confidence: number;  // 0-1
  matchedOn: 'name' | 'nickname' | 'email' | 'phone' | 'partial';
}

export interface DisambiguationResult {
  needsDisambiguation: boolean;
  matches: ContactMatch[];
  message?: string;  // Question to ask user
}

// =============================================================================
// Storage
// =============================================================================

const sonderDir = resolve(process.env.HOME || '', '.sonder');
const contactsPath = resolve(sonderDir, 'contacts.json');

function generateId(name: string, email?: string): string {
  const base = email?.split('@')[0] || name.toLowerCase().replace(/\s+/g, '_');
  const timestamp = Date.now().toString(36).slice(-4);
  return `${base.slice(0, 16)}_${timestamp}`;
}

function generateInteractionId(): string {
  return `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function loadContacts(): Contact[] {
  try {
    if (existsSync(contactsPath)) {
      const data = JSON.parse(readFileSync(contactsPath, 'utf-8'));
      // Rehydrate dates
      return data.map((c: any) => ({
        ...c,
        interactions: (c.interactions || []).map((i: any) => ({
          ...i,
          date: new Date(i.date),
        })),
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        lastInteraction: c.lastInteraction ? new Date(c.lastInteraction) : undefined,
        firstInteraction: c.firstInteraction ? new Date(c.firstInteraction) : undefined,
      }));
    }
  } catch {}
  return [];
}

function saveContacts(contacts: Contact[]): void {
  if (!existsSync(sonderDir)) {
    mkdirSync(sonderDir, { recursive: true });
  }
  writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
}

// =============================================================================
// Contact Operations
// =============================================================================

/**
 * Add or update a contact
 */
export function addContact(contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'interactions' | 'interactionCount'>): Contact {
  const contacts = loadContacts();
  const now = new Date();

  // Check for existing by email or exact name
  const existingIdx = contacts.findIndex(c =>
    (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase()) ||
    c.name.toLowerCase() === contact.name.toLowerCase()
  );

  if (existingIdx >= 0) {
    // Update existing - merge data, don't overwrite interactions
    const existing = contacts[existingIdx];
    const updated: Contact = {
      ...existing,
      ...contact,
      interactions: existing.interactions,
      interactionCount: existing.interactionCount,
      lastInteraction: existing.lastInteraction,
      firstInteraction: existing.firstInteraction,
      updatedAt: now,
    };
    contacts[existingIdx] = updated;
    saveContacts(contacts);
    return updated;
  }

  // Create new
  const newContact: Contact = {
    ...contact,
    id: generateId(contact.name, contact.email),
    interactions: [],
    interactionCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  contacts.push(newContact);
  saveContacts(contacts);
  return newContact;
}

/**
 * Add an interaction to a contact's history
 */
export function addInteraction(
  contactId: string,
  interaction: Omit<Interaction, 'id' | 'date'> & { date?: Date }
): Interaction | null {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === contactId);

  if (idx < 0) return null;

  const newInteraction: Interaction = {
    ...interaction,
    id: generateInteractionId(),
    date: interaction.date || new Date(),
  };

  contacts[idx].interactions.push(newInteraction);
  contacts[idx].interactionCount++;
  contacts[idx].lastInteraction = newInteraction.date;
  if (!contacts[idx].firstInteraction) {
    contacts[idx].firstInteraction = newInteraction.date;
  }

  // Track frequent venues
  if (newInteraction.venue) {
    const venues = contacts[idx].frequentVenues || [];
    if (!venues.includes(newInteraction.venue)) {
      venues.push(newInteraction.venue);
      contacts[idx].frequentVenues = venues.slice(-5); // Keep last 5
    }
  }

  contacts[idx].updatedAt = new Date();
  saveContacts(contacts);

  return newInteraction;
}

/**
 * Get all contacts
 */
export function getContacts(): Contact[] {
  return loadContacts();
}

/**
 * Get a contact by ID
 */
export function getContactById(id: string): Contact | null {
  const contacts = loadContacts();
  return contacts.find(c => c.id === id) || null;
}

/**
 * Get contacts by category
 */
export function getContactsByCategory(category: ContactCategory): Contact[] {
  return loadContacts().filter(c => c.category === category);
}

/**
 * Find ALL matching contacts for a query (for disambiguation)
 */
export function findAllMatches(query: string): ContactMatch[] {
  const contacts = loadContacts();
  const queryLower = query.toLowerCase().trim();
  const matches: ContactMatch[] = [];

  for (const contact of contacts) {
    // Exact email match
    if (contact.email?.toLowerCase() === queryLower) {
      matches.push({ contact, confidence: 1.0, matchedOn: 'email' });
      continue;
    }

    // Exact phone match
    const queryPhone = query.replace(/[\s\-\(\)]/g, '');
    if (contact.phone?.replace(/[\s\-\(\)]/g, '') === queryPhone) {
      matches.push({ contact, confidence: 1.0, matchedOn: 'phone' });
      continue;
    }

    // Exact name match
    if (contact.name.toLowerCase() === queryLower) {
      matches.push({ contact, confidence: 1.0, matchedOn: 'name' });
      continue;
    }

    // Exact nickname match
    if (contact.nickname?.toLowerCase() === queryLower) {
      matches.push({ contact, confidence: 1.0, matchedOn: 'nickname' });
      continue;
    }

    // First name match (could match multiple people!)
    const firstName = contact.name.split(' ')[0].toLowerCase();
    if (firstName === queryLower) {
      matches.push({ contact, confidence: 0.7, matchedOn: 'partial' });
      continue;
    }

    // Partial name match
    const nameLower = contact.name.toLowerCase();
    if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
      matches.push({ contact, confidence: 0.6, matchedOn: 'partial' });
    }
  }

  // Sort by confidence
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Find contact with disambiguation support
 * Returns multiple matches if ambiguous, so agent can ask for clarification
 */
export function findContactWithDisambiguation(query: string): DisambiguationResult {
  const matches = findAllMatches(query);

  if (matches.length === 0) {
    return { needsDisambiguation: false, matches: [] };
  }

  // Single high-confidence match - no disambiguation needed
  if (matches.length === 1 && matches[0].confidence >= 0.9) {
    return { needsDisambiguation: false, matches };
  }

  // Multiple matches with same first name / similar confidence
  const highConfidenceMatches = matches.filter(m => m.confidence >= 0.6);

  if (highConfidenceMatches.length > 1) {
    // Need to disambiguate
    const names = highConfidenceMatches.map(m => {
      const c = m.contact;
      const details = [c.company, c.relationship].filter(Boolean).join(', ');
      return `• ${c.name}${details ? ` (${details})` : ''}`;
    }).join('\n');

    return {
      needsDisambiguation: true,
      matches: highConfidenceMatches,
      message: `I found multiple people matching "${query}":\n${names}\n\nWhich one did you mean? Please use their full name.`,
    };
  }

  // Single match but low confidence - might want to confirm
  if (matches[0].confidence < 0.8) {
    const c = matches[0].contact;
    return {
      needsDisambiguation: true,
      matches,
      message: `Did you mean ${c.name}${c.relationship ? ` (${c.relationship})` : ''}?`,
    };
  }

  return { needsDisambiguation: false, matches };
}

/**
 * Find a single contact (legacy - for simple lookups)
 */
export function findContact(query: string): ContactMatch | null {
  const result = findContactWithDisambiguation(query);
  if (result.matches.length > 0 && !result.needsDisambiguation) {
    return result.matches[0];
  }
  // Return first match even if disambiguation needed (caller can handle)
  return result.matches[0] || null;
}

/**
 * Search contacts by query (more fuzzy)
 */
export function searchContacts(query: string): Contact[] {
  const contacts = loadContacts();
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);

  return contacts.filter(c => {
    const searchable = [
      c.name,
      c.nickname,
      c.email,
      c.company,
      c.role,
      c.relationship,
      c.notes,
      ...(c.frequentVenues || []),
    ].filter(Boolean).join(' ').toLowerCase();

    return queryWords.some(word => searchable.includes(word));
  });
}

/**
 * Resolve a name/email/phone to contact info
 * Returns disambiguation info if multiple matches
 */
export function resolveContact(query: string): {
  resolved: boolean;
  contact?: Contact;
  email?: string;
  phone?: string;
  displayName: string;
  needsDisambiguation?: boolean;
  disambiguationMessage?: string;
  allMatches?: Contact[];
} {
  const result = findContactWithDisambiguation(query);

  if (result.needsDisambiguation) {
    return {
      resolved: false,
      displayName: query,
      needsDisambiguation: true,
      disambiguationMessage: result.message,
      allMatches: result.matches.map(m => m.contact),
    };
  }

  if (result.matches.length > 0 && result.matches[0].confidence >= 0.7) {
    const contact = result.matches[0].contact;
    return {
      resolved: true,
      contact,
      email: contact.email,
      phone: contact.phone,
      displayName: contact.name,
    };
  }

  // Check if query is already an email
  if (query.includes('@')) {
    return {
      resolved: false,
      email: query,
      displayName: query.split('@')[0],
    };
  }

  // Check if query is a phone number
  if (/^\+?\d[\d\s\-()]{8,}$/.test(query)) {
    return {
      resolved: false,
      phone: query.replace(/[\s\-\(\)]/g, ''),
      displayName: query,
    };
  }

  return {
    resolved: false,
    displayName: query,
  };
}

/**
 * Record a calendar event interaction with attendees
 */
export function recordCalendarEvent(opts: {
  attendeeEmails: string[];
  eventTitle: string;
  eventDate: Date;
  venue?: string;
  venueAddress?: string;
  calendarEventId?: string;
  agentId?: string;
}): void {
  const contacts = loadContacts();
  const now = new Date();

  for (const email of opts.attendeeEmails) {
    const contact = contacts.find(c => c.email?.toLowerCase() === email.toLowerCase());

    if (contact) {
      addInteraction(contact.id, {
        type: 'calendar_event',
        summary: opts.eventTitle,
        venue: opts.venue,
        venueAddress: opts.venueAddress,
        calendarEventId: opts.calendarEventId,
        attendees: opts.attendeeEmails.filter(e => e !== email),
        agentId: opts.agentId,
        date: opts.eventDate,
      });
    }
  }
}

/**
 * Record an email sent
 */
export function recordEmailSent(opts: {
  toEmails: string[];
  subject: string;
  agentId?: string;
}): void {
  const contacts = loadContacts();

  for (const email of opts.toEmails) {
    const contact = contacts.find(c => c.email?.toLowerCase() === email.toLowerCase());

    if (contact) {
      addInteraction(contact.id, {
        type: 'email_sent',
        summary: `Sent: ${opts.subject}`,
        emailSubject: opts.subject,
        agentId: opts.agentId,
      });
    }
  }
}

/**
 * Get interaction history for a contact
 */
export function getInteractionHistory(contactId: string, limit = 20): Interaction[] {
  const contact = getContactById(contactId);
  if (!contact) return [];

  return contact.interactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

/**
 * Get recent interactions across all contacts
 */
export function getRecentInteractions(limit = 20): Array<{ contact: Contact; interaction: Interaction }> {
  const contacts = loadContacts();
  const all: Array<{ contact: Contact; interaction: Interaction }> = [];

  for (const contact of contacts) {
    for (const interaction of contact.interactions) {
      all.push({ contact, interaction });
    }
  }

  return all
    .sort((a, b) => b.interaction.date.getTime() - a.interaction.date.getTime())
    .slice(0, limit);
}

/**
 * Get frequently contacted (recent)
 */
export function getRecentContacts(limit = 10): Contact[] {
  const contacts = loadContacts();
  return contacts
    .filter(c => c.lastInteraction)
    .sort((a, b) => (b.lastInteraction?.getTime() || 0) - (a.lastInteraction?.getTime() || 0))
    .slice(0, limit);
}

/**
 * Mark a contact as recently contacted
 */
export function markContacted(contactId: string): void {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === contactId);

  if (idx >= 0) {
    contacts[idx].lastInteraction = new Date();
    contacts[idx].updatedAt = new Date();
    saveContacts(contacts);
  }
}

/**
 * Extract email addresses from text
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return [...new Set(text.match(emailRegex) || [])];
}

/**
 * Extract phone numbers from text
 */
export function extractPhones(text: string): string[] {
  const phoneRegex = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
  const matches = text.match(phoneRegex) || [];
  return [...new Set(
    matches
      .map(p => p.replace(/[\s\-\(\)\.]/g, ''))
      .filter(p => p.length >= 10)
  )];
}

/**
 * Format contact for display (with interaction summary)
 */
export function formatContact(contact: Contact, includeHistory = false): string {
  const lines = [
    `**${contact.name}**${contact.nickname ? ` (${contact.nickname})` : ''}`,
  ];

  if (contact.category) lines.push(`Category: ${contact.category}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (contact.company) lines.push(`Company: ${contact.company}`);
  if (contact.role) lines.push(`Role: ${contact.role}`);
  if (contact.relationship) lines.push(`Relationship: ${contact.relationship}`);

  if (contact.interactionCount > 0) {
    lines.push(`Interactions: ${contact.interactionCount}`);
    if (contact.lastInteraction) {
      lines.push(`Last contact: ${contact.lastInteraction.toLocaleDateString()}`);
    }
  }

  if (contact.frequentVenues?.length) {
    lines.push(`Usually meet at: ${contact.frequentVenues.join(', ')}`);
  }

  if (includeHistory && contact.interactions.length > 0) {
    lines.push('\nRecent interactions:');
    const recent = contact.interactions.slice(-5).reverse();
    for (const i of recent) {
      const date = i.date.toLocaleDateString();
      lines.push(`  • ${date}: ${i.summary}${i.venue ? ` @ ${i.venue}` : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * List all contacts formatted
 */
export function listContactsFormatted(): string {
  const contacts = loadContacts();

  if (contacts.length === 0) {
    return "No contacts saved yet. I'll remember people as you mention them!";
  }

  // Group by category
  const byCategory: Record<string, Contact[]> = {};
  for (const c of contacts) {
    const cat = c.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c);
  }

  const sections = Object.entries(byCategory).map(([cat, list]) => {
    const header = cat.charAt(0).toUpperCase() + cat.slice(1);
    const items = list.map(c => {
      const info = [c.email, c.phone].filter(Boolean).join(', ');
      const interactions = c.interactionCount > 0 ? ` [${c.interactionCount} interactions]` : '';
      return `  • ${c.name}${c.nickname ? ` (${c.nickname})` : ''}${info ? `: ${info}` : ''}${interactions}`;
    }).join('\n');
    return `**${header}** (${list.length})\n${items}`;
  });

  return sections.join('\n\n');
}

/**
 * Get contact graph summary
 */
export function getContactsSummary(): {
  total: number;
  byCategory: Record<ContactCategory, number>;
  totalInteractions: number;
  recentlyContacted: Contact[];
} {
  const contacts = loadContacts();

  const byCategory: Record<ContactCategory, number> = {
    friend: 0,
    family: 0,
    business: 0,
    acquaintance: 0,
  };

  let totalInteractions = 0;

  for (const c of contacts) {
    if (c.category && byCategory[c.category] !== undefined) {
      byCategory[c.category]++;
    }
    totalInteractions += c.interactionCount;
  }

  return {
    total: contacts.length,
    byCategory,
    totalInteractions,
    recentlyContacted: getRecentContacts(5),
  };
}

// =============================================================================
// Skill exports
// =============================================================================

export const ContactSkills = {
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
  getRecentContacts,
  markContacted,
  extractEmails,
  extractPhones,
  formatContact,
  listContactsFormatted,
  getContactsSummary,
};

export default ContactSkills;
