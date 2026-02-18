/**
 * Reflection Engine
 *
 * Analyzes user data to detect patterns.
 * Runs periodically to generate insights.
 */

import type { LLMProvider } from '../types/index.js';
import type { Pattern, PatternCategory, PatternValence, PatternEvidence } from './patterns.js';

// =============================================================================
// Types
// =============================================================================

export interface UserDataSnapshot {
  userId: string;

  // Recent conversations (summaries)
  recentConversations: ConversationSummary[];

  // Tasks
  tasks: TaskSnapshot[];

  // Calendar (if available)
  calendarEvents?: CalendarSnapshot[];

  // Behavioral signals
  activityTimes: Date[];           // When user was active
  messageFrequency: number;        // Messages per day average
  averageResponseTime: number;     // How fast they reply (minutes)

  // Emotional signals (from sentiment)
  moodIndicators: MoodIndicator[];
}

export interface ConversationSummary {
  date: Date;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  keyPhrases: string[];
  agentId: string;
}

export interface TaskSnapshot {
  id: string;
  content: string;
  createdAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  status: 'pending' | 'completed' | 'abandoned';
  mentionCount: number;            // How often user talked about it
  avoidanceSignals: number;        // Signs of avoidance
}

export interface CalendarSnapshot {
  date: Date;
  title: string;
  attended: boolean;
}

export interface MoodIndicator {
  date: Date;
  mood: 'happy' | 'stressed' | 'sad' | 'anxious' | 'calm' | 'frustrated';
  confidence: number;
  source: string;                  // What indicated this
}

export interface DetectedPattern {
  category: PatternCategory;
  valence: PatternValence;
  description: string;
  shortForm: string;
  confidence: number;
  evidence: PatternEvidence[];
  subjects?: string[];
  actionable: boolean;
  suggestedAction?: string;
}

/**
 * Play can provide custom analyzers
 */
export interface PatternAnalyzer {
  name: string;
  category: PatternCategory;
  analyze(data: UserDataSnapshot): Promise<DetectedPattern[]>;
}

// =============================================================================
// Built-in Analyzers
// =============================================================================

/**
 * Detect task avoidance patterns
 */
export const taskAvoidanceAnalyzer: PatternAnalyzer = {
  name: 'task_avoidance',
  category: 'task',

  async analyze(data: UserDataSnapshot): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Find tasks that are old and incomplete
    const avoidedTasks = data.tasks.filter(t => {
      if (t.status !== 'pending') return false;
      const daysOld = (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld > 3 && t.mentionCount > 2;
    });

    for (const task of avoidedTasks) {
      const daysOld = Math.floor((Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60 * 24));

      patterns.push({
        category: 'task',
        valence: 'negative',
        description: `User has been avoiding "${task.content}" for ${daysOld} days despite mentioning it ${task.mentionCount} times`,
        shortForm: `avoiding_${task.id}`,
        confidence: Math.min(0.9, 0.4 + (task.avoidanceSignals * 0.1)),
        evidence: [{
          date: new Date(),
          observation: `Task "${task.content}" created ${daysOld} days ago, mentioned ${task.mentionCount} times, still pending`,
          source: 'task',
        }],
        subjects: [task.content],
        actionable: true,
        suggestedAction: `Gentle check-in about "${task.content}" - ask what's blocking`,
      });
    }

    return patterns;
  },
};

/**
 * Detect temporal patterns (when user is active/productive)
 */
export const temporalAnalyzer: PatternAnalyzer = {
  name: 'temporal_patterns',
  category: 'temporal',

  async analyze(data: UserDataSnapshot): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Analyze activity times
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};

    for (const time of data.activityTimes) {
      const date = new Date(time);
      const hour = date.getHours();
      const day = date.getDay();

      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    // Find peak hours
    const totalActivity = Object.values(hourCounts).reduce((a, b) => a + b, 0);
    if (totalActivity > 10) {
      const morningActivity = (hourCounts[6] || 0) + (hourCounts[7] || 0) + (hourCounts[8] || 0) + (hourCounts[9] || 0);
      const eveningActivity = (hourCounts[20] || 0) + (hourCounts[21] || 0) + (hourCounts[22] || 0) + (hourCounts[23] || 0);

      if (morningActivity > eveningActivity * 1.5) {
        patterns.push({
          category: 'temporal',
          valence: 'neutral',
          description: 'User is most active in the morning (6am-10am)',
          shortForm: 'morning_person',
          confidence: 0.7,
          evidence: [{
            date: new Date(),
            observation: `Morning activity: ${morningActivity}, Evening activity: ${eveningActivity}`,
            source: 'behavior',
          }],
          actionable: true,
          suggestedAction: 'Schedule check-ins and important nudges in the morning',
        });
      } else if (eveningActivity > morningActivity * 1.5) {
        patterns.push({
          category: 'temporal',
          valence: 'neutral',
          description: 'User is most active in the evening (8pm-midnight)',
          shortForm: 'night_owl',
          confidence: 0.7,
          evidence: [{
            date: new Date(),
            observation: `Morning activity: ${morningActivity}, Evening activity: ${eveningActivity}`,
            source: 'behavior',
          }],
          actionable: true,
          suggestedAction: 'Schedule check-ins and important nudges in the evening',
        });
      }
    }

    // Find low days
    const avgDayActivity = Object.values(dayCounts).reduce((a, b) => a + b, 0) / 7;
    for (const [day, count] of Object.entries(dayCounts)) {
      if (count < avgDayActivity * 0.5) {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(day)];
        patterns.push({
          category: 'temporal',
          valence: 'neutral',
          description: `User is less active on ${dayName}s`,
          shortForm: `low_activity_${dayName.toLowerCase()}`,
          confidence: 0.6,
          evidence: [{
            date: new Date(),
            observation: `${dayName} activity: ${count}, average: ${avgDayActivity.toFixed(1)}`,
            source: 'behavior',
          }],
          actionable: true,
          suggestedAction: `Be gentler with nudges on ${dayName}s`,
        });
      }
    }

    return patterns;
  },
};

/**
 * Detect emotional patterns
 */
export const emotionalAnalyzer: PatternAnalyzer = {
  name: 'emotional_patterns',
  category: 'emotional',

  async analyze(data: UserDataSnapshot): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group moods by day of week
    const moodsByDay: Record<number, MoodIndicator[]> = {};
    for (const mood of data.moodIndicators) {
      const day = new Date(mood.date).getDay();
      moodsByDay[day] = moodsByDay[day] || [];
      moodsByDay[day].push(mood);
    }

    // Check for consistent negative moods on specific days
    for (const [day, moods] of Object.entries(moodsByDay)) {
      const negativeMoods = moods.filter(m =>
        ['stressed', 'sad', 'anxious', 'frustrated'].includes(m.mood)
      );

      if (moods.length >= 3 && negativeMoods.length / moods.length > 0.6) {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(day)];
        patterns.push({
          category: 'emotional',
          valence: 'negative',
          description: `User often feels down on ${dayName}s`,
          shortForm: `${dayName.toLowerCase()}_blues`,
          confidence: 0.6,
          evidence: [{
            date: new Date(),
            observation: `${negativeMoods.length} of ${moods.length} mood indicators on ${dayName}s were negative`,
            source: 'inferred',
          }],
          actionable: true,
          suggestedAction: `Proactive check-in on ${dayName} morning or Saturday evening`,
        });
      }
    }

    return patterns;
  },
};

/**
 * Detect growth patterns (improvements)
 */
export const growthAnalyzer: PatternAnalyzer = {
  name: 'growth_patterns',
  category: 'growth',

  async analyze(data: UserDataSnapshot): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Check task completion rate over time
    const completedTasks = data.tasks.filter(t => t.status === 'completed');
    const recentCompleted = completedTasks.filter(t => {
      const daysAgo = (Date.now() - new Date(t.completedAt!).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 14;
    });

    const olderCompleted = completedTasks.filter(t => {
      const daysAgo = (Date.now() - new Date(t.completedAt!).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo > 14 && daysAgo <= 28;
    });

    if (recentCompleted.length > olderCompleted.length * 1.5 && recentCompleted.length >= 3) {
      patterns.push({
        category: 'growth',
        valence: 'positive',
        description: 'User is completing more tasks recently',
        shortForm: 'improving_completion',
        confidence: 0.7,
        evidence: [{
          date: new Date(),
          observation: `Completed ${recentCompleted.length} tasks in last 2 weeks vs ${olderCompleted.length} in prior 2 weeks`,
          source: 'task',
        }],
        actionable: true,
        suggestedAction: 'Celebrate this improvement!',
      });
    }

    return patterns;
  },
};

// =============================================================================
// Reflection Engine
// =============================================================================

export class ReflectionEngine {
  private provider: LLMProvider;
  private analyzers: PatternAnalyzer[];

  constructor(provider: LLMProvider) {
    this.provider = provider;
    this.analyzers = [
      taskAvoidanceAnalyzer,
      temporalAnalyzer,
      emotionalAnalyzer,
      growthAnalyzer,
    ];
  }

  /**
   * Add a custom analyzer
   */
  addAnalyzer(analyzer: PatternAnalyzer): void {
    this.analyzers.push(analyzer);
  }

  /**
   * Run all analyzers on user data
   */
  async analyze(data: UserDataSnapshot): Promise<DetectedPattern[]> {
    const allPatterns: DetectedPattern[] = [];

    for (const analyzer of this.analyzers) {
      try {
        const patterns = await analyzer.analyze(data);
        allPatterns.push(...patterns);
      } catch (error) {
        console.error(`[ReflectionEngine] Analyzer ${analyzer.name} failed:`, error);
      }
    }

    return allPatterns;
  }

  /**
   * Use LLM to detect patterns from conversation history
   */
  async analyzeConversations(
    userId: string,
    conversations: ConversationSummary[]
  ): Promise<DetectedPattern[]> {
    if (conversations.length < 5) {
      return []; // Not enough data
    }

    const conversationText = conversations
      .map(c => `[${c.date.toDateString()}] Topics: ${c.topics.join(', ')}. Sentiment: ${c.sentiment}. Key phrases: ${c.keyPhrases.join(', ')}`)
      .join('\n');

    const prompt = `Analyze these conversation summaries and identify any patterns about the user.

CONVERSATIONS:
${conversationText}

Look for:
1. Recurring topics or concerns
2. Emotional patterns (when do they seem stressed/happy?)
3. Things they mention but never act on
4. Growth or regression in any area
5. Relationships they mention frequently

For each pattern found, respond in this format:
PATTERN: [short name]
CATEGORY: [behavior|temporal|emotional|relational|task|growth]
VALENCE: [positive|negative|neutral]
DESCRIPTION: [one sentence description]
CONFIDENCE: [0.0-1.0]
ACTIONABLE: [yes|no]
ACTION: [suggested action if actionable]
---

If no clear patterns, respond with: NO_PATTERNS_DETECTED`;

    try {
      const response = await this.provider.generate(prompt, {
        temperature: 0.3,
        maxTokens: 1000,
      });

      return this.parsePatternResponse(userId, response);
    } catch (error) {
      console.error('[ReflectionEngine] LLM analysis failed:', error);
      return [];
    }
  }

  /**
   * Parse LLM response into patterns
   */
  private parsePatternResponse(userId: string, response: string): DetectedPattern[] {
    if (response.includes('NO_PATTERNS_DETECTED')) {
      return [];
    }

    const patterns: DetectedPattern[] = [];
    const blocks = response.split('---').filter(b => b.trim());

    for (const block of blocks) {
      try {
        const pattern = this.parsePatternBlock(block);
        if (pattern) {
          patterns.push(pattern);
        }
      } catch (error) {
        // Skip malformed blocks
      }
    }

    return patterns;
  }

  private parsePatternBlock(block: string): DetectedPattern | null {
    const lines = block.trim().split('\n');
    const data: Record<string, string> = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        data[match[1].toLowerCase()] = match[2].trim();
      }
    }

    if (!data.pattern || !data.description) {
      return null;
    }

    return {
      category: (data.category as PatternCategory) || 'behavior',
      valence: (data.valence as PatternValence) || 'neutral',
      description: data.description,
      shortForm: data.pattern.toLowerCase().replace(/\s+/g, '_'),
      confidence: parseFloat(data.confidence) || 0.5,
      evidence: [{
        date: new Date(),
        observation: 'Detected from conversation analysis',
        source: 'inferred',
      }],
      actionable: data.actionable?.toLowerCase() === 'yes',
      suggestedAction: data.action,
    };
  }
}
