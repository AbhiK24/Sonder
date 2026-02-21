/**
 * Venue Understanding
 *
 * Helps agents understand and resolve venue names to full addresses.
 * Stores user's known venues for quick lookup.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Types
// =============================================================================

export interface Venue {
  name: string;
  shortName?: string;  // Aliases like "Bloom" for "Bloom Hotel Jayanagar"
  address: string;
  city?: string;
  type?: 'cafe' | 'restaurant' | 'office' | 'hotel' | 'coworking' | 'home' | 'other';
  mapsUrl?: string;
  notes?: string;
}

export interface VenueMatch {
  venue: Venue;
  confidence: number;  // 0-1
}

// =============================================================================
// Storage
// =============================================================================

const sonderDir = resolve(process.env.HOME || '', '.sonder');
const venuesPath = resolve(sonderDir, 'venues.json');
const venuesBackupPath = venuesPath + '.backup';

function loadVenues(): Venue[] {
  // Try main file first, then backup
  for (const filePath of [venuesPath, venuesBackupPath]) {
    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));

        // If we loaded from backup, restore main file
        if (filePath === venuesBackupPath) {
          console.warn('[Venues] Recovered from backup file');
          writeFileSync(venuesPath, JSON.stringify(data, null, 2));
        }

        return data;
      }
    } catch (error) {
      console.error(`[Venues] Failed to load ${filePath}:`, error);
    }
  }
  return [];
}

function saveVenues(venues: Venue[]): void {
  try {
    if (!existsSync(sonderDir)) {
      mkdirSync(sonderDir, { recursive: true });
    }

    // Create backup before overwriting
    if (existsSync(venuesPath)) {
      try {
        copyFileSync(venuesPath, venuesBackupPath);
      } catch (backupError) {
        console.warn('[Venues] Failed to create backup:', backupError);
      }
    }

    writeFileSync(venuesPath, JSON.stringify(venues, null, 2));
  } catch (error) {
    console.error('[Venues] Failed to save venues:', error);
    throw error;
  }
}

// =============================================================================
// Venue Operations
// =============================================================================

/**
 * Add or update a known venue
 */
export function addVenue(venue: Venue): void {
  const venues = loadVenues();
  const existing = venues.findIndex(v =>
    v.name.toLowerCase() === venue.name.toLowerCase()
  );

  if (existing >= 0) {
    venues[existing] = { ...venues[existing], ...venue };
  } else {
    venues.push(venue);
  }

  saveVenues(venues);
}

/**
 * Get all known venues
 */
export function getVenues(): Venue[] {
  return loadVenues();
}

/**
 * Search for a venue by name (fuzzy match)
 */
export function findVenue(query: string): VenueMatch | null {
  const venues = loadVenues();
  const queryLower = query.toLowerCase().trim();

  // Exact match on name or shortName
  for (const venue of venues) {
    if (venue.name.toLowerCase() === queryLower) {
      return { venue, confidence: 1.0 };
    }
    if (venue.shortName?.toLowerCase() === queryLower) {
      return { venue, confidence: 1.0 };
    }
  }

  // Partial match
  for (const venue of venues) {
    const nameLower = venue.name.toLowerCase();
    const shortNameLower = venue.shortName?.toLowerCase() || '';

    // Query is part of venue name
    if (nameLower.includes(queryLower) || shortNameLower.includes(queryLower)) {
      return { venue, confidence: 0.8 };
    }

    // Venue name is part of query
    if (queryLower.includes(nameLower) || queryLower.includes(shortNameLower)) {
      return { venue, confidence: 0.7 };
    }
  }

  // Word-based match
  const queryWords = queryLower.split(/\s+/);
  for (const venue of venues) {
    const venueWords = venue.name.toLowerCase().split(/\s+/);
    const matchingWords = queryWords.filter(qw =>
      venueWords.some(vw => vw.includes(qw) || qw.includes(vw))
    );

    if (matchingWords.length > 0) {
      const confidence = matchingWords.length / Math.max(queryWords.length, venueWords.length);
      if (confidence >= 0.3) {
        return { venue, confidence: Math.min(confidence, 0.6) };
      }
    }
  }

  return null;
}

/**
 * Resolve a venue query to a location string
 * Returns the full address if found, or the original query if not
 */
export function resolveVenue(query: string): { location: string; venue?: Venue; resolved: boolean } {
  const match = findVenue(query);

  if (match && match.confidence >= 0.5) {
    return {
      location: match.venue.address,
      venue: match.venue,
      resolved: true,
    };
  }

  return {
    location: query,
    resolved: false,
  };
}

/**
 * Format venue for display
 */
export function formatVenue(venue: Venue): string {
  let result = venue.name;
  if (venue.address) {
    result += `\n  ${venue.address}`;
  }
  if (venue.mapsUrl) {
    result += `\n  ${venue.mapsUrl}`;
  }
  return result;
}

/**
 * List all venues formatted
 */
export function listVenuesFormatted(): string {
  const venues = loadVenues();

  if (venues.length === 0) {
    return "No saved venues yet. Tell me about places you frequently meet and I'll remember them.";
  }

  return venues.map(v => {
    const alias = v.shortName ? ` (${v.shortName})` : '';
    return `• ${v.name}${alias}: ${v.address}`;
  }).join('\n');
}

// =============================================================================
// Skill exports
// =============================================================================

export const VenueSkills = {
  addVenue,
  getVenues,
  findVenue,
  resolveVenue,
  listVenuesFormatted,
};

export default VenueSkills;
