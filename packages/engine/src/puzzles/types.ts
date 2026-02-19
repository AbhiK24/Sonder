/**
 * Puzzle System Types
 *
 * Daily puzzles for narrative games.
 * Engine generates, player solves, progress tracked.
 */

// =============================================================================
// Puzzle Types
// =============================================================================

export type PuzzleType = 'spot_the_lie' | 'who_said_it' | 'sequence' | 'fill_blank';

export interface Puzzle {
  id: string;
  type: PuzzleType;
  generatedAt: Date;
  expiresAt: Date;          // When this puzzle is no longer valid
  difficulty: 1 | 2 | 3;    // 1=easy, 3=hard

  // The puzzle content
  content: PuzzleContent;

  // The answer
  correctAnswer: string;

  // Context that generated this puzzle
  sourceContext: {
    events: string[];       // What happened that led to this puzzle
    involvedAgents: string[];
  };

  // State
  status: 'pending' | 'solved' | 'failed' | 'expired';
  attempts: number;
  solvedAt?: Date;
  userAnswer?: string;
}

// =============================================================================
// Puzzle Content by Type
// =============================================================================

export type PuzzleContent =
  | SpotTheLieContent
  | WhoSaidItContent
  | SequenceContent
  | FillBlankContent;

export interface SpotTheLieContent {
  type: 'spot_the_lie';
  statements: Array<{
    speaker: string;        // NPC name
    speakerEmoji?: string;
    statement: string;
    isLie: boolean;
  }>;
}

export interface WhoSaidItContent {
  type: 'who_said_it';
  quote: string;
  options: string[];        // NPC names
}

export interface SequenceContent {
  type: 'sequence';
  events: Array<{
    id: string;
    description: string;
  }>;
  correctOrder: string[];   // Event IDs in correct order
}

export interface FillBlankContent {
  type: 'fill_blank';
  statement: string;        // "Roderick was with ___ that night"
  blank: string;            // The word that goes in blank
  hint?: string;
}

// =============================================================================
// Progress Tracking
// =============================================================================

export interface CaseProgress {
  caseId: string;
  caseName: string;

  // Points toward solving
  progressPoints: number;
  pointsToSolve: number;    // e.g., 10 points to solve case

  // Puzzle history
  puzzlesSolved: number;
  puzzlesFailed: number;
  currentStreak: number;
  longestStreak: number;

  // Discovery
  cluesDiscovered: string[];
  suspectsCleared: string[];

  // State
  status: 'active' | 'solved' | 'abandoned';
  startedAt: Date;
  solvedAt?: Date;

  // Current day's puzzle
  todaysPuzzle?: Puzzle;
  lastPuzzleDate?: string;  // YYYY-MM-DD
}

// =============================================================================
// Scoring
// =============================================================================

export interface ScoringRules {
  // Points for correct answers
  correctBase: number;          // e.g., 1
  streakBonus: number;          // e.g., +1 for 3+ streak
  difficultyMultiplier: boolean; // Scale by difficulty?

  // Penalties
  wrongPenalty: number;         // e.g., 0 (no penalty, just no progress)

  // Thresholds
  pointsToSolve: number;        // e.g., 10
}

export const DEFAULT_SCORING: ScoringRules = {
  correctBase: 1,
  streakBonus: 1,
  wrongPenalty: 0,
  difficultyMultiplier: true,
  pointsToSolve: 10,
};

// =============================================================================
// Puzzle Result
// =============================================================================

export interface PuzzleResult {
  correct: boolean;
  pointsEarned: number;
  newTotal: number;
  progressPercent: number;      // 0-100
  streakBroken: boolean;
  newStreak: number;

  // Narrative payoff
  revelation?: string;          // What they learn if correct
  consequence?: string;         // What happens if wrong

  // Next steps
  caseSolved: boolean;
  nextPuzzleAvailable: Date;
}

// =============================================================================
// Daily Digest
// =============================================================================

export interface DailyDigest {
  date: string;                 // YYYY-MM-DD

  // What happened while away
  events: DigestEvent[];

  // Summary for display
  summary: string;

  // The puzzle generated from these events
  puzzle: Puzzle;
}

export interface DigestEvent {
  id: string;
  timestamp: Date;
  type: 'conversation' | 'discovery' | 'movement' | 'tension';
  description: string;
  involvedAgents: string[];

  // For puzzle generation
  facts: string[];              // True facts from this event
  possibleLies: string[];       // Things NPCs might lie about
}
