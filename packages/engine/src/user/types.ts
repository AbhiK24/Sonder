/**
 * User Profile & Goals
 *
 * Lives at engine level, accessible to all plays.
 * Goals are gathered during FTUE and drive proactive agent behavior.
 */

export type GoalDomain = 'personal' | 'professional' | 'relationship' | 'health' | 'creative';

export type GoalTimeline = 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'ongoing' | 'someday';

export interface GoalMilestone {
  description: string;
  achievedAt?: Date;
  sharedAt: Date;
}

export interface Goal {
  id: string;
  domain: GoalDomain;
  statement: string;           // "Get promoted to senior engineer"
  why: string;                 // "I want to prove I can lead"
  timeline: GoalTimeline;
  targetDate?: Date;           // Specific date if known
  milestones: GoalMilestone[]; // Progress markers they've shared
  status: 'active' | 'achieved' | 'abandoned' | 'paused';
  createdAt: Date;
  lastCheckedIn?: Date;
  nextCheckIn?: Date;          // Scheduled follow-up
}

export interface UserContext {
  recentWin?: string;          // Gathered during FTUE
  recentStruggle?: string;     // Gathered during FTUE
  communicationStyle?: 'direct' | 'gentle' | 'playful';
  energyLevel?: 'high' | 'medium' | 'low';
}

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;  // User's email (from Google OAuth or FTUE)
  timezone: string;

  // Goals - the core of proactive support
  goals: Goal[];

  // Context gathered during FTUE
  context: UserContext;

  // FTUE tracking
  ftueCompleted: boolean;
  ftueCompletedAt?: Date;

  // Engagement patterns (learned over time)
  patterns: {
    typicalActiveHours?: [number, number];  // [startHour, endHour]
    preferredCheckInTime?: string;          // "morning" | "evening"
    averageResponseTime?: number;           // minutes
  };

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Helper to create a new goal
 */
export function createGoal(
  domain: GoalDomain,
  statement: string,
  why: string,
  timeline: GoalTimeline,
  targetDate?: Date
): Goal {
  return {
    id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    domain,
    statement,
    why,
    timeline,
    targetDate,
    milestones: [],
    status: 'active',
    createdAt: new Date(),
  };
}

/**
 * Helper to create a new user profile
 */
export function createUserProfile(timezone: string = 'UTC'): UserProfile {
  return {
    id: `user_${Date.now()}`,
    timezone,
    goals: [],
    context: {},
    ftueCompleted: false,
    patterns: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
