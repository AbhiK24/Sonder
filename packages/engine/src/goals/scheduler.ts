/**
 * Goal Follow-up Scheduler
 *
 * Monitors goal timelines and triggers appropriate follow-ups.
 * Uses the orchestrator to compose emotionally mature messages.
 */

import type { Goal, UserProfile } from '../user/types.js';
import type { Orchestrator, OrchestrationContext, OrchestratorDecision } from '../orchestrator/types.js';

export interface GoalFollowUpEvent {
  type: 'approaching' | 'due' | 'overdue' | 'achieved' | 'check_in';
  goal: Goal;
  daysUntilDue?: number;
  daysSinceDue?: number;
}

export interface ScheduledFollowUp {
  id: string;
  goalId: string;
  userId: string;
  scheduledFor: Date;
  eventType: GoalFollowUpEvent['type'];
  executed: boolean;
  executedAt?: Date;
  result?: OrchestratorDecision;
}

/**
 * Calculate when to follow up on a goal
 */
export function calculateFollowUps(goal: Goal, daysBeforeDeadline: number = 3): Date[] {
  const followUps: Date[] = [];

  if (goal.status !== 'active') {
    return followUps;
  }

  const now = new Date();

  // If goal has a specific target date
  if (goal.targetDate) {
    const daysUntil = Math.floor(
      (goal.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Follow up X days before
    if (daysUntil > daysBeforeDeadline) {
      const followUpDate = new Date(goal.targetDate);
      followUpDate.setDate(followUpDate.getDate() - daysBeforeDeadline);
      followUps.push(followUpDate);
    }

    // Follow up day before
    if (daysUntil > 1) {
      const dayBefore = new Date(goal.targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      followUps.push(dayBefore);
    }

    // Follow up on the day
    if (daysUntil >= 0) {
      followUps.push(new Date(goal.targetDate));
    }
  } else {
    // Timeline-based follow-ups
    const scheduleBasedOnTimeline = (): Date[] => {
      const dates: Date[] = [];
      const baseDate = new Date();

      switch (goal.timeline) {
        case 'this_week':
          // Check in mid-week and end of week
          baseDate.setDate(baseDate.getDate() + 3);
          dates.push(new Date(baseDate));
          baseDate.setDate(baseDate.getDate() + 2);
          dates.push(new Date(baseDate));
          break;

        case 'this_month':
          // Check in weekly
          for (let i = 1; i <= 4; i++) {
            const weekDate = new Date();
            weekDate.setDate(weekDate.getDate() + i * 7);
            dates.push(weekDate);
          }
          break;

        case 'this_quarter':
          // Check in bi-weekly
          for (let i = 1; i <= 6; i++) {
            const biWeekDate = new Date();
            biWeekDate.setDate(biWeekDate.getDate() + i * 14);
            dates.push(biWeekDate);
          }
          break;

        case 'ongoing':
          // Weekly check-ins indefinitely (next 4 weeks)
          for (let i = 1; i <= 4; i++) {
            const weekDate = new Date();
            weekDate.setDate(weekDate.getDate() + i * 7);
            dates.push(weekDate);
          }
          break;

        case 'someday':
          // Monthly check-ins
          const monthDate = new Date();
          monthDate.setMonth(monthDate.getMonth() + 1);
          dates.push(monthDate);
          break;
      }

      return dates;
    };

    followUps.push(...scheduleBasedOnTimeline());
  }

  // Filter out past dates and sort
  return followUps
    .filter(d => d > now)
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Check if a goal needs a follow-up now
 */
export function checkGoalFollowUp(goal: Goal, daysBeforeDeadline: number = 3): GoalFollowUpEvent | null {
  if (goal.status !== 'active') {
    return null;
  }

  const now = new Date();
  const lastCheckedIn = goal.lastCheckedIn || goal.createdAt;
  const daysSinceLastCheckIn = Math.floor(
    (now.getTime() - lastCheckedIn.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check target date goals
  if (goal.targetDate) {
    const daysUntilDue = Math.floor(
      (goal.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0) {
      return { type: 'overdue', goal, daysSinceDue: Math.abs(daysUntilDue) };
    }

    if (daysUntilDue === 0) {
      return { type: 'due', goal };
    }

    if (daysUntilDue <= daysBeforeDeadline && daysSinceLastCheckIn >= 1) {
      return { type: 'approaching', goal, daysUntilDue };
    }
  }

  // Regular check-ins based on timeline
  const checkInInterval = getCheckInIntervalDays(goal.timeline);
  if (daysSinceLastCheckIn >= checkInInterval) {
    return { type: 'check_in', goal };
  }

  return null;
}

/**
 * Get check-in interval in days based on timeline
 */
function getCheckInIntervalDays(timeline: Goal['timeline']): number {
  switch (timeline) {
    case 'this_week':
      return 2;
    case 'this_month':
      return 5;
    case 'this_quarter':
      return 10;
    case 'this_year':
      return 14;
    case 'ongoing':
      return 7;
    case 'someday':
      return 30;
    default:
      return 7;
  }
}

/**
 * Generate follow-up message using orchestrator
 */
export async function generateGoalFollowUp(
  event: GoalFollowUpEvent,
  userProfile: UserProfile,
  orchestrator: Orchestrator
): Promise<OrchestratorDecision> {
  const context: OrchestrationContext = {
    trigger: event.type === 'achieved'
      ? { type: 'goal_achieved', goal: event.goal }
      : { type: 'goal_deadline', goal: event.goal },
    userProfile,
    relevantGoal: event.goal,
    recentTopics: [event.goal.statement, event.goal.domain],
    conversationTone: event.type === 'achieved' ? 'celebratory' : 'supportive',
  };

  // Add sentiment hints based on event type
  if (event.type === 'overdue') {
    context.userSentiment = 'stressed';
  } else if (event.type === 'achieved') {
    context.userSentiment = 'excited';
  }

  return orchestrator.orchestrate(context);
}

/**
 * Mark a goal as achieved
 */
export function markGoalAchieved(goal: Goal): Goal {
  return {
    ...goal,
    status: 'achieved',
    milestones: [
      ...goal.milestones,
      {
        description: 'Goal achieved!',
        achievedAt: new Date(),
        sharedAt: new Date(),
      },
    ],
  };
}

/**
 * Mark a goal with progress
 */
export function addGoalMilestone(goal: Goal, description: string): Goal {
  return {
    ...goal,
    milestones: [
      ...goal.milestones,
      {
        description,
        sharedAt: new Date(),
      },
    ],
    lastCheckedIn: new Date(),
  };
}
