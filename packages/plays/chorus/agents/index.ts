/**
 * Chorus Agents
 *
 * Five voices harmonizing to support your ADHD brain.
 * Each agent has a specific role and speaks up when their expertise is needed.
 */

export { luna } from './luna.js';
export { ember } from './ember.js';
export { sage } from './sage.js';
export { joy } from './joy.js';
export { echo } from './echo.js';

import { luna } from './luna.js';
import { ember } from './ember.js';
import { sage } from './sage.js';
import { joy } from './joy.js';
import { echo } from './echo.js';
import type { ChorusAgent, ChorusAgentId } from '../types.js';

// =============================================================================
// Agent Registry
// =============================================================================

export const agents: Record<ChorusAgentId, ChorusAgent> = {
  luna,
  ember,
  sage,
  joy,
  echo,
};

export const agentList: ChorusAgent[] = [luna, ember, sage, joy, echo];

// =============================================================================
// Agent Selection Logic
// =============================================================================

/**
 * Get the best agent to respond to a given situation
 */
export function selectAgent(context: {
  userMessage: string;
  emotionalState?: 'calm' | 'stressed' | 'overwhelmed' | 'stuck' | 'spiraling';
  taskContext?: 'planning' | 'starting' | 'working' | 'completing' | 'reflecting';
  needsReminder?: boolean;
  needsCelebration?: boolean;
}): ChorusAgent {
  const { userMessage, emotionalState, taskContext, needsReminder, needsCelebration } = context;
  const lowerMessage = userMessage.toLowerCase();

  // Emotional keywords → Echo
  if (
    emotionalState === 'spiraling' ||
    lowerMessage.includes('feel') ||
    lowerMessage.includes('anxious') ||
    lowerMessage.includes('stressed') ||
    lowerMessage.includes('overwhelmed') ||
    lowerMessage.includes('angry') ||
    lowerMessage.includes('sad') ||
    lowerMessage.includes('scared')
  ) {
    return echo;
  }

  // Can't start → Ember
  if (
    taskContext === 'starting' ||
    lowerMessage.includes("can't start") ||
    lowerMessage.includes('stuck') ||
    lowerMessage.includes('procrastinating') ||
    lowerMessage.includes("don't want to") ||
    lowerMessage.includes('paralyzed')
  ) {
    return ember;
  }

  // Needs planning → Sage
  if (
    taskContext === 'planning' ||
    lowerMessage.includes('prioritize') ||
    lowerMessage.includes('which should i') ||
    lowerMessage.includes('how do i') ||
    lowerMessage.includes('too many') ||
    lowerMessage.includes('plan')
  ) {
    return sage;
  }

  // Completed something / needs celebration → Joy
  if (
    needsCelebration ||
    taskContext === 'completing' ||
    lowerMessage.includes('finished') ||
    lowerMessage.includes('did it') ||
    lowerMessage.includes('completed') ||
    lowerMessage.includes('done with')
  ) {
    return joy;
  }

  // Needs a reminder / pattern observation → Luna
  if (
    needsReminder ||
    lowerMessage.includes('remember') ||
    lowerMessage.includes('forgot') ||
    lowerMessage.includes('last time') ||
    lowerMessage.includes('pattern')
  ) {
    return luna;
  }

  // Default to Luna for general conversation (she's the keeper)
  return luna;
}

/**
 * Get agents who should participate in a discussion about a topic
 */
export function selectDiscussionParticipants(topic: string): ChorusAgent[] {
  const lowerTopic = topic.toLowerCase();

  // Always include Luna (she remembers context)
  const participants: ChorusAgent[] = [luna];

  // Add others based on topic
  if (
    lowerTopic.includes('task') ||
    lowerTopic.includes('start') ||
    lowerTopic.includes('procrastinating')
  ) {
    participants.push(ember);
  }

  if (
    lowerTopic.includes('plan') ||
    lowerTopic.includes('priorit') ||
    lowerTopic.includes('overwhelm')
  ) {
    participants.push(sage);
  }

  if (
    lowerTopic.includes('feel') ||
    lowerTopic.includes('emotion') ||
    lowerTopic.includes('stress') ||
    lowerTopic.includes('anxious')
  ) {
    participants.push(echo);
  }

  if (
    lowerTopic.includes('win') ||
    lowerTopic.includes('progress') ||
    lowerTopic.includes('growth')
  ) {
    participants.push(joy);
  }

  // If only Luna, add at least one more for discussion
  if (participants.length === 1) {
    participants.push(sage); // Sage is a good default partner
  }

  return participants;
}

// =============================================================================
// Check-in Assignments
// =============================================================================

/**
 * Get the lead agent for different types of check-ins
 */
export function getCheckInLead(type: 'morning' | 'midday' | 'evening' | 'weekly'): ChorusAgent {
  switch (type) {
    case 'morning':
      return luna; // Orient the day, remember what's important
    case 'midday':
      return ember; // Energy boost, get unstuck if needed
    case 'evening':
      return joy; // Celebrate wins, reflect on progress
    case 'weekly':
      return sage; // Big picture, what patterns are emerging
  }
}
