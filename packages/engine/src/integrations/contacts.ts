/**
 * Contacts / Friends Graph
 *
 * Stores and manages user's contacts for quick lookup and communication.
 * Categories: friends, family, business, acquaintance
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Types
// =============================================================================

export type ContactCategory = 'friend' | 'family' | 'business' | 'acquaintance';

export interface Contact {
  id: string;  // Generated from name or email
  name: string;
  nickname?: string;  // Short name or alias
  email?: string;
  phone?: string;  // With country code
  category: ContactCategory;
  company?: string;
  role?: string;  // Their job title or role
  relationship?: string;  // "college friend", "client", "manager at X", etc.
  notes?: string;
  lastContacted?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactMatch {
  contact: Contact;
  confidence: number;  // 0-1
  matchedOn: 'name' | 'nickname' | 'email' | 'phone';
}

// =============================================================================
// Storage
// =============================================================================

const sonderDir = resolve(process.env.HOME || '', '.sonder');
const contactsPath = resolve(sonderDir, 'contacts.json');

function generateId(name: string, email?: string): string {
  const base = email?.split('@')[0] || name.toLowerCase().replace(/\s+/g, '_');
  return base.slice(0, 20);
}

function loadContacts(): Contact[] {
  try {
    if (existsSync(contactsPath)) {
      const data = JSON.parse(readFileSync(contactsPath, 'utf-8'));
      // Rehydrate dates
      return data.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        lastContacted: c.lastContacted ? new Date(c.lastContacted) : undefined,
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
export function addContact(contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Contact {
  const contacts = loadContacts();
  const now = new Date();

  // Check for existing by email or name
  const existingIdx = contacts.findIndex(c =>
    (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase()) ||
    c.name.toLowerCase() === contact.name.toLowerCase()
  );

  if (existingIdx >= 0) {
    // Update existing
    const updated = {
      ...contacts[existingIdx],
      ...contact,
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
    createdAt: now,
    updatedAt: now,
  };

  contacts.push(newContact);
  saveContacts(contacts);
  return newContact;
}

/**
 * Get all contacts
 */
export function getContacts(): Contact[] {
  return loadContacts();
}

/**
 * Get contacts by category
 */
export function getContactsByCategory(category: ContactCategory): Contact[] {
  return loadContacts().filter(c => c.category === category);
}

/**
 * Find a contact by name, email, or phone (fuzzy match)
 */
export function findContact(query: string): ContactMatch | null {
  const contacts = loadContacts();
  const queryLower = query.toLowerCase().trim();

  // Exact email match
  for (const contact of contacts) {
    if (contact.email?.toLowerCase() === queryLower) {
      return { contact, confidence: 1.0, matchedOn: 'email' };
    }
  }

  // Exact phone match (normalized)
  const queryPhone = query.replace(/[\s\-\(\)]/g, '');
  for (const contact of contacts) {
    if (contact.phone?.replace(/[\s\-\(\)]/g, '') === queryPhone) {
      return { contact, confidence: 1.0, matchedOn: 'phone' };
    }
  }

  // Exact name or nickname match
  for (const contact of contacts) {
    if (contact.name.toLowerCase() === queryLower) {
      return { contact, confidence: 1.0, matchedOn: 'name' };
    }
    if (contact.nickname?.toLowerCase() === queryLower) {
      return { contact, confidence: 1.0, matchedOn: 'nickname' };
    }
  }

  // Partial name match
  for (const contact of contacts) {
    const nameLower = contact.name.toLowerCase();
    const nickLower = contact.nickname?.toLowerCase() || '';

    if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
      return { contact, confidence: 0.8, matchedOn: 'name' };
    }
    if (nickLower && (nickLower.includes(queryLower) || queryLower.includes(nickLower))) {
      return { contact, confidence: 0.8, matchedOn: 'nickname' };
    }
  }

  // First name match
  for (const contact of contacts) {
    const firstName = contact.name.split(' ')[0].toLowerCase();
    if (firstName === queryLower || queryLower.includes(firstName)) {
      return { contact, confidence: 0.7, matchedOn: 'name' };
    }
  }

  return null;
}

/**
 * Search contacts by query (more fuzzy than findContact)
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
    ].filter(Boolean).join(' ').toLowerCase();

    // Match if any query word appears
    return queryWords.some(word => searchable.includes(word));
  });
}

/**
 * Resolve a name/email/phone to contact info
 * Returns enhanced info if found, or original if not
 */
export function resolveContact(query: string): {
  resolved: boolean;
  contact?: Contact;
  email?: string;
  phone?: string;
  displayName: string;
} {
  const match = findContact(query);

  if (match && match.confidence >= 0.7) {
    return {
      resolved: true,
      contact: match.contact,
      email: match.contact.email,
      phone: match.contact.phone,
      displayName: match.contact.name,
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
 * Mark a contact as recently contacted
 */
export function markContacted(contactId: string): void {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === contactId);

  if (idx >= 0) {
    contacts[idx].lastContacted = new Date();
    contacts[idx].updatedAt = new Date();
    saveContacts(contacts);
  }
}

/**
 * Get frequently contacted (recent)
 */
export function getRecentContacts(limit = 10): Contact[] {
  const contacts = loadContacts();
  return contacts
    .filter(c => c.lastContacted)
    .sort((a, b) => (b.lastContacted?.getTime() || 0) - (a.lastContacted?.getTime() || 0))
    .slice(0, limit);
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
  // Match common phone formats
  const phoneRegex = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
  const matches = text.match(phoneRegex) || [];

  // Filter to likely phone numbers (at least 10 digits)
  return [...new Set(
    matches
      .map(p => p.replace(/[\s\-\(\)\.]/g, ''))
      .filter(p => p.length >= 10)
  )];
}

/**
 * Format contact for display
 */
export function formatContact(contact: Contact): string {
  const lines = [
    `**${contact.name}**${contact.nickname ? ` (${contact.nickname})` : ''}`,
  ];

  if (contact.category) lines.push(`Category: ${contact.category}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (contact.company) lines.push(`Company: ${contact.company}`);
  if (contact.role) lines.push(`Role: ${contact.role}`);
  if (contact.relationship) lines.push(`Relationship: ${contact.relationship}`);

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
      return `  • ${c.name}${c.nickname ? ` (${c.nickname})` : ''}${info ? `: ${info}` : ''}`;
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
  recentlyContacted: Contact[];
} {
  const contacts = loadContacts();

  const byCategory: Record<ContactCategory, number> = {
    friend: 0,
    family: 0,
    business: 0,
    acquaintance: 0,
  };

  for (const c of contacts) {
    if (c.category && byCategory[c.category] !== undefined) {
      byCategory[c.category]++;
    }
  }

  return {
    total: contacts.length,
    byCategory,
    recentlyContacted: getRecentContacts(5),
  };
}

// =============================================================================
// Skill exports
// =============================================================================

export const ContactSkills = {
  addContact,
  getContacts,
  getContactsByCategory,
  findContact,
  searchContacts,
  resolveContact,
  markContacted,
  getRecentContacts,
  extractEmails,
  extractPhones,
  formatContact,
  listContactsFormatted,
  getContactsSummary,
};

export default ContactSkills;
