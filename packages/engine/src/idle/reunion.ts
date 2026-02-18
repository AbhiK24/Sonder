/**
 * Reunion Builder
 *
 * Builds the "welcome back" experience from accumulated thoughts.
 * The payoff of the idle loop.
 */

import type { AccumulatedThought, ThoughtType } from './accumulator.js';
import type { PresenceStatus } from './detector.js';

// =============================================================================
// Types
// =============================================================================

export type ReunionMood =
  | 'excited'     // User accomplished something, positive vibes
  | 'warm'        // Gentle, welcoming return
  | 'concerned'   // Agents were worried
  | 'curious'     // Have questions for user
  | 'celebratory' // Big accomplishment while away
  | 'thoughtful'; // Deep reflections to share

export interface ReunionPayload {
  userId: string;

  // How long were they away
  awayDuration: number;  // minutes
  previousStatus: PresenceStatus;

  // What accumulated
  thoughts: AccumulatedThought[];

  // Computed properties
  mood: ReunionMood;
  leadAgent: string;           // Who speaks first
  summary: string;             // Brief summary of what accumulated
  hasImportant: boolean;       // Are there high-importance thoughts?

  // For display
  thoughtsByAgent: Map<string, AccumulatedThought[]>;
}

export interface ReunionMessage {
  // The formatted message to send
  text: string;

  // Optional: structured data for rich display
  structured?: {
    greeting: string;
    thoughts: Array<{
      agent: string;
      content: string;
      type: ThoughtType;
    }>;
    followUp?: string;
  };
}

/**
 * Play provides this to customize reunion formatting
 */
export interface ReunionFormatter {
  /**
   * Format the reunion payload into a message
   */
  format(payload: ReunionPayload): ReunionMessage;

  /**
   * Generate a summary of accumulated thoughts
   */
  summarize(thoughts: AccumulatedThought[], awayDuration: number): string;

  /**
   * Determine the mood of the reunion
   */
  determineMood(thoughts: AccumulatedThought[]): ReunionMood;

  /**
   * Pick which agent should lead the reunion
   */
  pickLeadAgent(thoughts: AccumulatedThought[]): string;
}

// =============================================================================
// Default Formatter
// =============================================================================

export const defaultFormatter: ReunionFormatter = {
  format(payload) {
    const { thoughts, awayDuration, leadAgent, mood, summary } = payload;

    if (thoughts.length === 0) {
      return {
        text: `Welcome back! You were away for ${formatDuration(awayDuration)}.`,
      };
    }

    // Group by agent
    const byAgent = new Map<string, AccumulatedThought[]>();
    for (const thought of thoughts) {
      const existing = byAgent.get(thought.agentId) || [];
      existing.push(thought);
      byAgent.set(thought.agentId, existing);
    }

    // Build the message
    let text = `*Welcome back!* You were away for ${formatDuration(awayDuration)}.\n\n`;

    if (summary) {
      text += `_${summary}_\n\n`;
    }

    // Show top thoughts (limit to 3-4)
    const topThoughts = thoughts
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 4);

    for (const thought of topThoughts) {
      text += `**${thought.agentId}** (${thought.type}): "${thought.content}"\n\n`;
    }

    if (thoughts.length > 4) {
      text += `_...and ${thoughts.length - 4} more thoughts waiting._`;
    }

    return {
      text,
      structured: {
        greeting: `Welcome back! You were away for ${formatDuration(awayDuration)}.`,
        thoughts: topThoughts.map(t => ({
          agent: t.agentId,
          content: t.content,
          type: t.type,
        })),
        followUp: thoughts.length > 4
          ? `${thoughts.length - 4} more thoughts waiting`
          : undefined,
      },
    };
  },

  summarize(thoughts, awayDuration) {
    if (thoughts.length === 0) return '';

    const types = new Set(thoughts.map(t => t.type));
    const agents = new Set(thoughts.map(t => t.agentId));

    if (awayDuration > 60 * 24) {
      return `The agents have been thinking about you. ${thoughts.length} thoughts accumulated.`;
    } else if (types.has('concern')) {
      return `Some of us were concerned while you were away.`;
    } else if (types.has('celebration')) {
      return `We have something to celebrate!`;
    } else {
      return `${agents.size} agent${agents.size > 1 ? 's' : ''} had thoughts while you were away.`;
    }
  },

  determineMood(thoughts) {
    if (thoughts.length === 0) return 'warm';

    const types = thoughts.map(t => t.type);
    const avgImportance = thoughts.reduce((sum, t) => sum + t.importance, 0) / thoughts.length;

    if (types.includes('celebration')) return 'celebratory';
    if (types.includes('concern') && avgImportance > 6) return 'concerned';
    if (types.filter(t => t === 'question').length > 2) return 'curious';
    if (types.includes('reflection') && avgImportance > 7) return 'thoughtful';
    if (avgImportance > 7) return 'excited';

    return 'warm';
  },

  pickLeadAgent(thoughts) {
    if (thoughts.length === 0) return 'narrator';

    // Pick agent with highest importance thought
    const sorted = [...thoughts].sort((a, b) => b.importance - a.importance);
    return sorted[0].agentId;
  },
};

// =============================================================================
// Reunion Builder
// =============================================================================

export class ReunionBuilder {
  private formatter: ReunionFormatter;

  constructor(formatter: ReunionFormatter = defaultFormatter) {
    this.formatter = formatter;
  }

  /**
   * Set a custom formatter (Play provides this)
   */
  setFormatter(formatter: ReunionFormatter): void {
    this.formatter = formatter;
  }

  /**
   * Build a reunion payload from accumulated thoughts
   */
  build(
    userId: string,
    thoughts: AccumulatedThought[],
    awayDuration: number,
    previousStatus: PresenceStatus
  ): ReunionPayload {
    const mood = this.formatter.determineMood(thoughts);
    const leadAgent = this.formatter.pickLeadAgent(thoughts);
    const summary = this.formatter.summarize(thoughts, awayDuration);

    // Group by agent
    const thoughtsByAgent = new Map<string, AccumulatedThought[]>();
    for (const thought of thoughts) {
      const existing = thoughtsByAgent.get(thought.agentId) || [];
      existing.push(thought);
      thoughtsByAgent.set(thought.agentId, existing);
    }

    return {
      userId,
      awayDuration,
      previousStatus,
      thoughts,
      mood,
      leadAgent,
      summary,
      hasImportant: thoughts.some(t => t.importance >= 7),
      thoughtsByAgent,
    };
  }

  /**
   * Format a reunion payload into a message
   */
  format(payload: ReunionPayload): ReunionMessage {
    return this.formatter.format(payload);
  }

  /**
   * Build and format in one step
   */
  buildAndFormat(
    userId: string,
    thoughts: AccumulatedThought[],
    awayDuration: number,
    previousStatus: PresenceStatus
  ): { payload: ReunionPayload; message: ReunionMessage } {
    const payload = this.build(userId, thoughts, awayDuration, previousStatus);
    const message = this.format(payload);
    return { payload, message };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} minutes`;
  } else if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    const days = Math.round(minutes / 60 / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
}
