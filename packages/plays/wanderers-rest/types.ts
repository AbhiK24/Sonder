/**
 * Wanderer's Rest Types
 */

// =============================================================================
// NPC Types
// =============================================================================

export type WanderersNPCId =
  | 'maren'
  | 'kira'
  | 'aldric'
  | 'elena'
  | 'thom'
  | 'hooded';

export type NPCRole =
  | 'barkeep'
  | 'merchant'
  | 'blacksmith'
  | 'herbalist'
  | 'guard_captain'
  | 'mystery';

export interface WanderersNPC {
  id: WanderersNPCId;
  name: string;
  emoji: string;
  role: NPCRole;
  archetype: 'core_cast' | 'recurring' | 'mystery';
  description: string;
  personality: string[];
  voicePatterns: string[];
  examplePhrases: string[];

  // Knowledge for puzzle generation
  facts: string[];           // True things they know
  secrets: string[];         // Things they hide
  possibleLies: string[];    // Things they might lie about

  // Trust levels for revelation
  revealAtTrust: Record<number, string[]>;
}

// =============================================================================
// Case Types
// =============================================================================

export interface MysteryCase {
  id: string;
  name: string;
  description: string;
  status: 'locked' | 'active' | 'solved';

  // The puzzle parameters
  pointsToSolve: number;
  difficulty: 1 | 2 | 3;

  // NPCs involved
  involvedNPCs: WanderersNPCId[];

  // What gets revealed when solved
  revelation: string;
}

// =============================================================================
// World State
// =============================================================================

export interface TavernWorldState {
  day: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

  // Current guests
  presentNPCs: WanderersNPCId[];

  // Trust levels with each NPC
  trust: Record<WanderersNPCId, number>;

  // Case progress
  currentCase?: string;

  // Events that have happened
  events: TavernEvent[];
}

export interface TavernEvent {
  id: string;
  timestamp: Date;
  type: 'conversation' | 'arrival' | 'departure' | 'discovery' | 'tension';
  description: string;
  participants: WanderersNPCId[];
  witnessed: boolean; // Did the player see this?
}
