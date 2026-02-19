/**
 * Puzzle System
 *
 * Daily puzzles for narrative games.
 * Generates "Spot the Lie" and other puzzle types from NPC activity.
 */

// Types
export * from './types.js';

// Engine
export {
  PuzzleEngine,
  PuzzleFormatter,
  defaultPuzzleEngine,
  puzzleFormatter,
} from './engine.js';

// Digest
export {
  DigestGenerator,
  StoryGenerator,
  defaultDigestGenerator,
  storyGenerator,
  type NPCConversation,
  type NPCActivity,
  type NPCKnowledge,
} from './digest.js';
