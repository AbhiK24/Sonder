/**
 * Case System Types
 *
 * Cases are mysteries for the player to solve.
 * FTUE case runs days 1-7, then procedural cases begin.
 */

export type NPCCategory = 'townspeople' | 'visitor' | 'stranger';

export type CaseSeverity = 'minor' | 'medium' | 'major';

export type CaseStatus = 'hidden' | 'active' | 'solved' | 'cold';

export interface Clue {
  id: string;
  content: string;           // What the clue reveals
  source: string;            // NPC id or location
  revealCondition: {
    type: 'trust' | 'day' | 'clue' | 'ask';
    value: number | string;  // trust threshold, day number, prerequisite clue id, or topic keyword
  };
  revealed: boolean;
  pointsTo: string;          // suspect id or 'truth' or 'red_herring'
}

export interface Suspect {
  npcId: string;
  motive: string;            // Why they might have done it
  alibi: string;             // Their story
  isGuilty: boolean;
  suspicionLevel: number;    // 0-100, increases as player finds clues
}

export interface Case {
  id: string;
  title: string;
  hook: string;              // How the case is introduced
  description: string;       // Full description once active
  severity: CaseSeverity;
  status: CaseStatus;

  // When does this case become available?
  availableDay: number;
  expiresDay?: number;       // Some cases go cold

  // The mystery
  victim?: string;           // NPC id or description
  suspects: Suspect[];
  clues: Clue[];
  solution: string;          // The truth

  // Progression
  revealedClues: string[];   // Clue ids that player has found
  dayStarted?: number;
  daySolved?: number;
}

export interface FTUEProgress {
  stage: number;             // 0-7, which part of the story
  cluesRevealed: string[];
  npcsIntroduced: string[];
  complete: boolean;
}

// Case templates for procedural generation
export interface CaseTemplate {
  titlePatterns: string[];
  hookPatterns: string[];
  scenarios: Array<{
    type: string;            // theft, dispute, disappearance, rumor, threat
    victimRole: string;      // merchant, traveler, townsperson
    suspectCount: number;
    clueCount: number;
  }>;
}

export const CASE_TEMPLATES: Record<CaseSeverity, CaseTemplate> = {
  minor: {
    titlePatterns: [
      'The Missing {item}',
      'The {adjective} Accusation',
      'Whispers of {topic}',
    ],
    hookPatterns: [
      '{npc} approaches you looking troubled.',
      'You overhear an argument near the bar.',
      'A note is slipped under a door.',
    ],
    scenarios: [
      { type: 'missing_item', victimRole: 'visitor', suspectCount: 2, clueCount: 3 },
      { type: 'accusation', victimRole: 'townsperson', suspectCount: 2, clueCount: 2 },
      { type: 'rumor', victimRole: 'stranger', suspectCount: 1, clueCount: 2 },
    ],
  },
  medium: {
    titlePatterns: [
      'The {location} Incident',
      'Blood on the {item}',
      'The {npc} Affair',
    ],
    hookPatterns: [
      'Shouts erupt from outside. Something has happened.',
      '{npc} bursts in, pale and shaking.',
      'The morning brings grim news.',
    ],
    scenarios: [
      { type: 'theft', victimRole: 'merchant', suspectCount: 3, clueCount: 4 },
      { type: 'assault', victimRole: 'traveler', suspectCount: 3, clueCount: 5 },
      { type: 'threat', victimRole: 'townsperson', suspectCount: 2, clueCount: 4 },
    ],
  },
  major: {
    titlePatterns: [
      'Death at {location}',
      'The {adjective} Conspiracy',
      'The Fall of {npc}',
    ],
    hookPatterns: [
      'A body is found at dawn.',
      'The town wakes to tragedy.',
      '{npc} is missing. Foul play is suspected.',
    ],
    scenarios: [
      { type: 'murder', victimRole: 'townsperson', suspectCount: 4, clueCount: 7 },
      { type: 'conspiracy', victimRole: 'official', suspectCount: 4, clueCount: 8 },
      { type: 'disappearance', victimRole: 'visitor', suspectCount: 3, clueCount: 6 },
    ],
  },
};
