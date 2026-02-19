/**
 * First Time User Experience (FTUE)
 *
 * A structured flow that plays exactly once when a user first engages with a play.
 * Designed to:
 * 1. Welcome warmly (not generically)
 * 2. Gather context conversationally
 * 3. Collect goals that drive proactive behavior
 * 4. Demonstrate the unique value of the play
 * 5. Plant a hook for return
 */

import type { Goal, GoalDomain, GoalTimeline, UserProfile } from '../user/types.js';

/**
 * A single step in the FTUE flow
 */
export interface FTUEStep {
  id: string;
  type: 'message' | 'question' | 'goal_gathering' | 'value_demo' | 'hook';

  // For messages: what the agent says
  content?: string | ((context: FTUEContext) => string);

  // For questions: how to process the response
  processResponse?: (response: string, context: FTUEContext) => void;

  // Which agent delivers this step (orchestrator decides if not specified)
  agent?: string;

  // Delay before this step (feels more natural)
  delayMs?: number;

  // Condition to show this step
  condition?: (context: FTUEContext) => boolean;
}

/**
 * Context accumulated during FTUE
 */
export interface FTUEContext {
  userId: string;
  playId: string;
  userProfile: UserProfile;

  // Gathered during flow
  responses: Record<string, string>;
  goalsGathered: Goal[];

  // State
  currentStepIndex: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * The complete FTUE flow definition for a play
 */
export interface FTUEFlow {
  playId: string;

  // The sequence of steps
  steps: FTUEStep[];

  // Called when FTUE completes
  onComplete?: (context: FTUEContext) => void;
}

/**
 * Goal gathering helpers
 */
export interface GoalQuestion {
  domain: GoalDomain;
  askStatement: string;      // "What's one thing you're working toward?"
  askWhy: string;            // "Why does that matter to you?"
  askTimeline: string;       // "When do you hope to achieve this?"

  // Parse timeline from natural language
  parseTimeline: (response: string) => { timeline: GoalTimeline; targetDate?: Date };
}

/**
 * Default goal questions for each domain
 */
export const DEFAULT_GOAL_QUESTIONS: Record<GoalDomain, GoalQuestion> = {
  professional: {
    domain: 'professional',
    askStatement: "What's something you're working toward at work or in your career?",
    askWhy: "Why does that matter to you?",
    askTimeline: "When do you think that might happen?",
    parseTimeline: parseTimelineNatural,
  },
  personal: {
    domain: 'personal',
    askStatement: "What's a personal goal you're focused on?",
    askWhy: "What would achieving that mean for you?",
    askTimeline: "Any timeline in mind?",
    parseTimeline: parseTimelineNatural,
  },
  relationship: {
    domain: 'relationship',
    askStatement: "Is there a relationship you're trying to improve or build?",
    askWhy: "Why is that important to you right now?",
    askTimeline: "Is there a specific moment you're working toward?",
    parseTimeline: parseTimelineNatural,
  },
  health: {
    domain: 'health',
    askStatement: "Any health or wellness goals on your mind?",
    askWhy: "What's driving that?",
    askTimeline: "Any target date?",
    parseTimeline: parseTimelineNatural,
  },
  creative: {
    domain: 'creative',
    askStatement: "Working on any creative projects?",
    askWhy: "What excites you about it?",
    askTimeline: "When do you want to finish it?",
    parseTimeline: parseTimelineNatural,
  },
};

/**
 * Parse natural language timeline into structured format
 */
function parseTimelineNatural(response: string): { timeline: GoalTimeline; targetDate?: Date } {
  const lower = response.toLowerCase();
  const now = new Date();

  // This week
  if (lower.includes('this week') || lower.includes('few days') || lower.includes('tomorrow')) {
    return { timeline: 'this_week' };
  }

  // This month
  if (lower.includes('this month') || lower.includes('few weeks') || lower.includes('end of month')) {
    return { timeline: 'this_month' };
  }

  // This quarter
  if (lower.includes('quarter') || lower.includes('few months') || lower.includes('next month')) {
    return { timeline: 'this_quarter' };
  }

  // This year
  if (lower.includes('this year') || lower.includes('by end of year') || lower.includes('december')) {
    return { timeline: 'this_year' };
  }

  // Specific month mentions
  const months = ['january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) {
      const targetDate = new Date(now.getFullYear(), i, 15);
      if (targetDate < now) {
        targetDate.setFullYear(now.getFullYear() + 1);
      }
      return { timeline: 'this_year', targetDate };
    }
  }

  // Ongoing / no specific time
  if (lower.includes('ongoing') || lower.includes('always') || lower.includes('continuous')) {
    return { timeline: 'ongoing' };
  }

  // Someday / no rush
  if (lower.includes('someday') || lower.includes('eventually') || lower.includes('no rush')) {
    return { timeline: 'someday' };
  }

  // Default to this_quarter if unclear
  return { timeline: 'this_quarter' };
}

export { parseTimelineNatural };
