/**
 * Case System for Wanderer's Rest
 *
 * Multiple mysteries that unlock progressively.
 * Each case has its own NPCs, content, and 15 days of puzzles.
 */

import type { WanderersNPCId } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface CaseDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  unlockCondition: 'start' | 'previous_solved';
  pointsToSolve: number;

  // NPCs involved (some recurring, some new)
  npcs: CaseNPC[];

  // The 15 days of content
  days: CaseDayContent[];

  // What happens when solved
  resolution: string;

  // Teaser for next case (shown after solving)
  nextCaseTeaser?: string;
}

export interface CaseNPC {
  id: string;
  name: string;
  emoji: string;
  role: string;
  isNew: boolean; // New to this case?
  introduction?: string; // How they're introduced if new
}

export interface CaseDayContent {
  day: number;
  digest: string;
  statements: Array<{
    speakerId: string;
    speakerName: string;
    speakerEmoji: string;
    statement: string;
    isLie: boolean;
  }>;
  correctAnswer: number;
  revelation: string;
}

// =============================================================================
// Case Registry
// =============================================================================

export const CASES: CaseDefinition[] = [];

/**
 * Register a new case
 */
export function registerCase(caseDef: CaseDefinition): void {
  CASES.push(caseDef);
}

/**
 * Get case by ID
 */
export function getCase(caseId: string): CaseDefinition | undefined {
  return CASES.find(c => c.id === caseId);
}

/**
 * Get the first/starting case
 */
export function getStartingCase(): CaseDefinition {
  return CASES[0];
}

/**
 * Get the next case after solving one
 */
export function getNextCase(currentCaseId: string): CaseDefinition | null {
  const currentIndex = CASES.findIndex(c => c.id === currentCaseId);
  if (currentIndex === -1 || currentIndex >= CASES.length - 1) {
    return null; // No more cases, or loop back
  }
  return CASES[currentIndex + 1];
}

/**
 * Check if there are more cases after this one
 */
export function hasMoreCases(currentCaseId: string): boolean {
  const currentIndex = CASES.findIndex(c => c.id === currentCaseId);
  return currentIndex < CASES.length - 1;
}

// =============================================================================
// Case Transition Messages
// =============================================================================

export function getCaseSolvedMessage(caseDef: CaseDefinition): string {
  let msg = `🎉 *CASE SOLVED: ${caseDef.name}*\n\n`;
  msg += caseDef.resolution;
  msg += '\n\n---\n\n';

  if (caseDef.nextCaseTeaser) {
    msg += `*But the tavern's secrets run deeper...*\n\n`;
    msg += caseDef.nextCaseTeaser;
    msg += '\n\n_A new mystery begins tomorrow._';
  } else {
    msg += `You've uncovered all the tavern's secrets... for now.\n\n`;
    msg += `_Check back later for new mysteries._`;
  }

  return msg;
}

export function getNewCaseIntroMessage(caseDef: CaseDefinition): string {
  let msg = `📜 *NEW CASE: ${caseDef.name}*\n\n`;
  msg += `_${caseDef.tagline}_\n\n`;
  msg += caseDef.description;
  msg += '\n\n';

  // Introduce new NPCs
  const newNPCs = caseDef.npcs.filter(n => n.isNew);
  if (newNPCs.length > 0) {
    msg += '*New faces at the tavern:*\n';
    for (const npc of newNPCs) {
      msg += `${npc.emoji} *${npc.name}* — ${npc.role}\n`;
      if (npc.introduction) {
        msg += `   _${npc.introduction}_\n`;
      }
    }
    msg += '\n';
  }

  msg += `Solve this case by earning ${caseDef.pointsToSolve} points.\n`;
  msg += `Find the lies. Uncover the truth.`;

  return msg;
}
