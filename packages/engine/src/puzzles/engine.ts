/**
 * Puzzle Engine
 *
 * Generates daily puzzles from digest events.
 * Handles solving, scoring, and case progress.
 */

import type {
  Puzzle,
  PuzzleType,
  PuzzleContent,
  SpotTheLieContent,
  WhoSaidItContent,
  CaseProgress,
  PuzzleResult,
  ScoringRules,
  DailyDigest,
  DigestEvent,
  DEFAULT_SCORING,
} from './types.js';
import { randomUUID } from 'crypto';

// =============================================================================
// Puzzle Engine
// =============================================================================

export class PuzzleEngine {
  private scoring: ScoringRules;

  constructor(scoring?: Partial<ScoringRules>) {
    this.scoring = {
      correctBase: 1,
      streakBonus: 1,
      wrongPenalty: 0,
      difficultyMultiplier: true,
      pointsToSolve: 10,
      ...scoring,
    };
  }

  // ===========================================================================
  // Puzzle Generation
  // ===========================================================================

  /**
   * Generate a puzzle from digest events
   */
  generatePuzzle(
    digest: DailyDigest,
    difficulty: 1 | 2 | 3 = 2
  ): Puzzle {
    // For now, focus on "Spot the Lie" - the core puzzle type
    const content = this.generateSpotTheLie(digest.events, difficulty);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return {
      id: randomUUID(),
      type: 'spot_the_lie',
      generatedAt: now,
      expiresAt: tomorrow,
      difficulty,
      content,
      correctAnswer: this.findCorrectAnswer(content),
      sourceContext: {
        events: digest.events.map(e => e.id),
        involvedAgents: this.extractAgents(digest.events),
      },
      status: 'pending',
      attempts: 0,
    };
  }

  /**
   * Generate a "Spot the Lie" puzzle
   *
   * Creates 3 statements from NPCs - 2 true, 1 false.
   * Player must identify the lie.
   */
  private generateSpotTheLie(
    events: DigestEvent[],
    difficulty: 1 | 2 | 3
  ): SpotTheLieContent {
    // Collect facts and possible lies from events
    const allFacts: Array<{ agent: string; fact: string }> = [];
    const allLies: Array<{ agent: string; lie: string }> = [];

    for (const event of events) {
      for (const agent of event.involvedAgents) {
        for (const fact of event.facts) {
          allFacts.push({ agent, fact });
        }
        for (const lie of event.possibleLies) {
          allLies.push({ agent, lie });
        }
      }
    }

    // We need at least 2 facts and 1 lie
    if (allFacts.length < 2 || allLies.length < 1) {
      // Fallback: generate placeholder content
      return this.generateFallbackSpotTheLie();
    }

    // Pick 2 random truths and 1 lie
    const truths = this.pickRandom(allFacts, 2);
    const lie = this.pickRandom(allLies, 1)[0];

    // Shuffle the statements
    const statements = this.shuffle([
      { speaker: truths[0].agent, statement: truths[0].fact, isLie: false },
      { speaker: truths[1].agent, statement: truths[1].fact, isLie: false },
      { speaker: lie.agent, statement: lie.lie, isLie: true },
    ]);

    // Add difficulty modifiers
    if (difficulty >= 2) {
      // Make lies more subtle at higher difficulty
      // (In real implementation, this would use LLM to rephrase)
    }

    return {
      type: 'spot_the_lie',
      statements,
    };
  }

  /**
   * Fallback puzzle when not enough events
   */
  private generateFallbackSpotTheLie(): SpotTheLieContent {
    return {
      type: 'spot_the_lie',
      statements: [
        {
          speaker: 'Mysterious Stranger',
          statement: 'I was at the tavern all evening.',
          isLie: false,
        },
        {
          speaker: 'Innkeeper',
          statement: 'The stranger arrived just after sunset.',
          isLie: false,
        },
        {
          speaker: 'Mysterious Stranger',
          statement: 'I never left my room that night.',
          isLie: true,
        },
      ],
    };
  }

  // ===========================================================================
  // Puzzle Solving
  // ===========================================================================

  /**
   * Submit an answer to a puzzle
   */
  solvePuzzle(
    puzzle: Puzzle,
    userAnswer: string,
    progress: CaseProgress
  ): { puzzle: Puzzle; progress: CaseProgress; result: PuzzleResult } {
    if (puzzle.status !== 'pending') {
      throw new Error(`Puzzle already ${puzzle.status}`);
    }

    const now = new Date();
    if (now > puzzle.expiresAt) {
      puzzle.status = 'expired';
      return {
        puzzle,
        progress,
        result: this.createExpiredResult(progress),
      };
    }

    puzzle.attempts++;
    puzzle.userAnswer = userAnswer;

    const correct = this.checkAnswer(puzzle, userAnswer);

    if (correct) {
      puzzle.status = 'solved';
      puzzle.solvedAt = now;
    } else {
      puzzle.status = 'failed';
    }

    // Calculate score
    const result = this.calculateResult(puzzle, progress, correct);

    // Update progress
    const updatedProgress = this.updateProgress(progress, puzzle, result);

    return {
      puzzle,
      progress: updatedProgress,
      result,
    };
  }

  /**
   * Check if the answer is correct
   */
  private checkAnswer(puzzle: Puzzle, userAnswer: string): boolean {
    // Normalize answers for comparison
    const normalize = (s: string) => s.toLowerCase().trim();
    return normalize(userAnswer) === normalize(puzzle.correctAnswer);
  }

  /**
   * Find the correct answer from puzzle content
   */
  private findCorrectAnswer(content: PuzzleContent): string {
    switch (content.type) {
      case 'spot_the_lie': {
        // Return the index (1-based) of the lie
        const lieIndex = content.statements.findIndex(s => s.isLie);
        return String(lieIndex + 1);
      }
      case 'who_said_it': {
        // Return the correct speaker
        return content.options[0]; // First option is always correct
      }
      case 'sequence': {
        // Return the correct order as comma-separated IDs
        return content.correctOrder.join(',');
      }
      case 'fill_blank': {
        return content.blank;
      }
    }
  }

  /**
   * Calculate the result of solving a puzzle
   */
  private calculateResult(
    puzzle: Puzzle,
    progress: CaseProgress,
    correct: boolean
  ): PuzzleResult {
    let pointsEarned = 0;
    let streakBroken = false;
    let newStreak = progress.currentStreak;

    if (correct) {
      // Base points
      pointsEarned = this.scoring.correctBase;

      // Difficulty multiplier
      if (this.scoring.difficultyMultiplier) {
        pointsEarned *= puzzle.difficulty;
      }

      // Streak bonus (3+ streak)
      if (progress.currentStreak >= 2) {
        pointsEarned += this.scoring.streakBonus;
      }

      newStreak = progress.currentStreak + 1;
    } else {
      // Wrong answer
      pointsEarned = -this.scoring.wrongPenalty; // Usually 0
      streakBroken = progress.currentStreak > 0;
      newStreak = 0;
    }

    const newTotal = Math.max(0, progress.progressPoints + pointsEarned);
    const progressPercent = Math.min(
      100,
      (newTotal / progress.pointsToSolve) * 100
    );
    const caseSolved = newTotal >= progress.pointsToSolve;

    return {
      correct,
      pointsEarned,
      newTotal,
      progressPercent,
      streakBroken,
      newStreak,
      caseSolved,
      nextPuzzleAvailable: this.getNextPuzzleTime(),
    };
  }

  /**
   * Create result for an expired puzzle
   */
  private createExpiredResult(progress: CaseProgress): PuzzleResult {
    return {
      correct: false,
      pointsEarned: 0,
      newTotal: progress.progressPoints,
      progressPercent: (progress.progressPoints / progress.pointsToSolve) * 100,
      streakBroken: progress.currentStreak > 0,
      newStreak: 0,
      caseSolved: false,
      nextPuzzleAvailable: this.getNextPuzzleTime(),
    };
  }

  /**
   * Update case progress after solving
   */
  private updateProgress(
    progress: CaseProgress,
    puzzle: Puzzle,
    result: PuzzleResult
  ): CaseProgress {
    const updated = { ...progress };

    updated.progressPoints = result.newTotal;
    updated.currentStreak = result.newStreak;
    updated.longestStreak = Math.max(
      updated.longestStreak,
      result.newStreak
    );

    if (result.correct) {
      updated.puzzlesSolved++;
    } else {
      updated.puzzlesFailed++;
    }

    if (result.caseSolved) {
      updated.status = 'solved';
      updated.solvedAt = new Date();
    }

    // Clear today's puzzle
    updated.todaysPuzzle = undefined;
    updated.lastPuzzleDate = this.getTodayString();

    return updated;
  }

  // ===========================================================================
  // Progress Management
  // ===========================================================================

  /**
   * Create initial case progress
   */
  createCaseProgress(caseId: string, caseName: string): CaseProgress {
    return {
      caseId,
      caseName,
      progressPoints: 0,
      pointsToSolve: this.scoring.pointsToSolve,
      puzzlesSolved: 0,
      puzzlesFailed: 0,
      currentStreak: 0,
      longestStreak: 0,
      cluesDiscovered: [],
      suspectsCleared: [],
      status: 'active',
      startedAt: new Date(),
    };
  }

  /**
   * Check if a new puzzle is available today
   */
  isPuzzleAvailable(progress: CaseProgress): boolean {
    if (progress.status !== 'active') return false;
    if (progress.todaysPuzzle) return false;

    const today = this.getTodayString();
    return progress.lastPuzzleDate !== today;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private extractAgents(events: DigestEvent[]): string[] {
    const agents = new Set<string>();
    for (const event of events) {
      for (const agent of event.involvedAgents) {
        agents.add(agent);
      }
    }
    return Array.from(agents);
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getNextPuzzleTime(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
    return tomorrow;
  }
}

// =============================================================================
// Puzzle Formatter (for chat display)
// =============================================================================

export class PuzzleFormatter {
  /**
   * Format puzzle for display in chat (Telegram/WhatsApp)
   */
  formatForChat(puzzle: Puzzle): string {
    switch (puzzle.content.type) {
      case 'spot_the_lie':
        return this.formatSpotTheLie(puzzle.content);
      case 'who_said_it':
        return this.formatWhoSaidIt(puzzle.content);
      case 'sequence':
        return this.formatSequence(puzzle.content);
      case 'fill_blank':
        return this.formatFillBlank(puzzle.content);
    }
  }

  private formatSpotTheLie(content: SpotTheLieContent): string {
    const lines = [
      '🔍 *SPOT THE LIE*',
      '',
      'One of these statements is FALSE. Which one?',
      '',
    ];

    content.statements.forEach((s, i) => {
      const emoji = s.speakerEmoji || '👤';
      lines.push(`${i + 1}. ${emoji} *${s.speaker}*: "${s.statement}"`);
    });

    lines.push('');
    lines.push('Reply with 1, 2, or 3');

    return lines.join('\n');
  }

  private formatWhoSaidIt(content: WhoSaidItContent): string {
    const lines = [
      '🗣️ *WHO SAID IT?*',
      '',
      `"${content.quote}"`,
      '',
      'Who said this?',
      '',
    ];

    content.options.forEach((name, i) => {
      lines.push(`${i + 1}. ${name}`);
    });

    lines.push('');
    lines.push(`Reply with 1-${content.options.length}`);

    return lines.join('\n');
  }

  private formatSequence(content: import('./types.js').SequenceContent): string {
    const lines = [
      '📜 *ORDER THE EVENTS*',
      '',
      'Put these events in the correct order:',
      '',
    ];

    content.events.forEach((e, i) => {
      lines.push(`${String.fromCharCode(65 + i)}. ${e.description}`);
    });

    lines.push('');
    lines.push('Reply with the correct order (e.g., "BAC")');

    return lines.join('\n');
  }

  private formatFillBlank(content: import('./types.js').FillBlankContent): string {
    const display = content.statement.replace('___', '_____');

    const lines = [
      '✏️ *FILL IN THE BLANK*',
      '',
      display,
      '',
    ];

    if (content.hint) {
      lines.push(`Hint: ${content.hint}`);
      lines.push('');
    }

    lines.push('Reply with your answer');

    return lines.join('\n');
  }

  /**
   * Format result for display
   */
  formatResult(result: PuzzleResult, puzzle: Puzzle): string {
    const lines: string[] = [];

    if (result.correct) {
      lines.push('✅ *CORRECT!*');
      lines.push('');

      if (result.pointsEarned > 1) {
        lines.push(`+${result.pointsEarned} points (streak bonus!)`);
      } else {
        lines.push(`+${result.pointsEarned} point`);
      }

      if (result.revelation) {
        lines.push('');
        lines.push(`💡 ${result.revelation}`);
      }
    } else {
      lines.push('❌ *WRONG*');
      lines.push('');

      // Show the correct answer
      if (puzzle.content.type === 'spot_the_lie') {
        const lieIndex = parseInt(puzzle.correctAnswer) - 1;
        const lie = puzzle.content.statements[lieIndex];
        lines.push(`The lie was: "${lie.statement}"`);
      }

      if (result.streakBroken) {
        lines.push('');
        lines.push('Your streak was broken.');
      }

      if (result.consequence) {
        lines.push('');
        lines.push(`⚠️ ${result.consequence}`);
      }
    }

    lines.push('');
    lines.push(`Progress: ${Math.round(result.progressPercent)}%`);
    lines.push(this.renderProgressBar(result.progressPercent));

    if (result.caseSolved) {
      lines.push('');
      lines.push('🎉 *CASE SOLVED!*');
    } else {
      lines.push('');
      lines.push('Come back tomorrow for the next puzzle!');
    }

    return lines.join('\n');
  }

  private renderProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format daily digest summary
   */
  formatDigestSummary(digest: DailyDigest): string {
    const lines = [
      '📰 *WHILE YOU WERE AWAY...*',
      '',
      digest.summary,
      '',
      '---',
      '',
    ];

    return lines.join('\n');
  }
}

// =============================================================================
// Exports
// =============================================================================

export const defaultPuzzleEngine = new PuzzleEngine();
export const puzzleFormatter = new PuzzleFormatter();
