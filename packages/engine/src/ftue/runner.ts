/**
 * FTUE Runner
 *
 * Manages the First Time User Experience flow.
 * Processes steps, handles responses, tracks progress.
 */

import type { FTUEFlow, FTUEStep, FTUEContext } from './types.js';
import type { UserProfile, Goal } from '../user/types.js';
import { createUserProfile } from '../user/types.js';

export interface FTUEState {
  active: boolean;
  flow: FTUEFlow;
  context: FTUEContext;
  currentStepIndex: number;
  waitingForResponse: boolean;
  pendingMessages: string[];
}

export interface FTUERunnerOptions {
  // Get agent name/emoji for formatting
  getAgentDisplay: (agentId: string) => { name: string; emoji: string };

  // Called when a message should be sent
  onMessage: (message: string, agentId: string) => Promise<void>;

  // Delay between messages (ms)
  messageDelay?: number;
}

/**
 * Create a new FTUE state for a user
 */
export function createFTUEState(
  flow: FTUEFlow,
  userId: string,
  existingProfile?: UserProfile
): FTUEState {
  const userProfile = existingProfile || createUserProfile();

  return {
    active: true,
    flow,
    context: {
      userId,
      playId: flow.playId,
      userProfile,
      responses: {},
      goalsGathered: [],
      currentStepIndex: 0,
      startedAt: new Date(),
    },
    currentStepIndex: 0,
    waitingForResponse: false,
    pendingMessages: [],
  };
}

/**
 * FTUE Runner - manages the flow
 */
export class FTUERunner {
  private state: FTUEState;
  private options: FTUERunnerOptions;

  constructor(state: FTUEState, options: FTUERunnerOptions) {
    this.state = state;
    this.options = options;
  }

  /**
   * Get current state
   */
  getState(): FTUEState {
    return this.state;
  }

  /**
   * Get user profile (with goals gathered so far)
   */
  getUserProfile(): UserProfile {
    return this.state.context.userProfile;
  }

  /**
   * Get goals gathered during FTUE
   */
  getGoals(): Goal[] {
    return this.state.context.goalsGathered;
  }

  /**
   * Check if FTUE is complete
   */
  isComplete(): boolean {
    return !this.state.active;
  }

  /**
   * Check if waiting for user response
   */
  isWaitingForResponse(): boolean {
    return this.state.waitingForResponse;
  }

  /**
   * Start the FTUE flow - sends initial messages until first question
   */
  async start(): Promise<void> {
    await this.processStepsUntilQuestion();
  }

  /**
   * Process a user response and continue the flow
   */
  async processResponse(userMessage: string): Promise<void> {
    if (!this.state.active || !this.state.waitingForResponse) {
      return;
    }

    // Get current step
    const step = this.state.flow.steps[this.state.currentStepIndex];

    // Process the response
    if (step.processResponse) {
      step.processResponse(userMessage, this.state.context);
    }

    // Store response
    this.state.context.responses[step.id] = userMessage;

    // Move to next step
    this.state.currentStepIndex++;
    this.state.context.currentStepIndex = this.state.currentStepIndex;
    this.state.waitingForResponse = false;

    // Continue processing
    await this.processStepsUntilQuestion();
  }

  /**
   * Process steps until we hit a question or complete
   */
  private async processStepsUntilQuestion(): Promise<void> {
    const { steps } = this.state.flow;

    while (this.state.currentStepIndex < steps.length) {
      const step = steps[this.state.currentStepIndex];

      // Check condition
      if (step.condition && !step.condition(this.state.context)) {
        this.state.currentStepIndex++;
        continue;
      }

      // Add delay if specified
      if (step.delayMs && step.delayMs > 0) {
        await this.delay(step.delayMs);
      }

      // Get message content
      const content = this.getStepContent(step);
      const agentId = step.agent || 'luna'; // Default to Luna

      // Send the message
      const { name, emoji } = this.options.getAgentDisplay(agentId);
      const formattedMessage = `${emoji} **${name}:** ${content}`;
      await this.options.onMessage(formattedMessage, agentId);

      // If this is a question, wait for response
      if (step.type === 'question' || step.type === 'goal_gathering') {
        this.state.waitingForResponse = true;
        return;
      }

      // Move to next step
      this.state.currentStepIndex++;
      this.state.context.currentStepIndex = this.state.currentStepIndex;
    }

    // Flow complete
    this.complete();
  }

  /**
   * Get content for a step (handle function vs string)
   */
  private getStepContent(step: FTUEStep): string {
    if (typeof step.content === 'function') {
      return step.content(this.state.context);
    }
    return step.content || '';
  }

  /**
   * Mark FTUE as complete
   */
  private complete(): void {
    this.state.active = false;
    this.state.context.completedAt = new Date();
    this.state.context.userProfile.ftueCompleted = true;
    this.state.context.userProfile.ftueCompletedAt = new Date();

    // Call onComplete hook
    if (this.state.flow.onComplete) {
      this.state.flow.onComplete(this.state.context);
    }

    console.log(`[FTUE] Complete for user ${this.state.context.userId}`);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.min(ms, 2000))); // Cap at 2s
  }
}

/**
 * Check if a user needs FTUE
 */
export function needsFTUE(profile: UserProfile | undefined): boolean {
  if (!profile) return true;
  return !profile.ftueCompleted;
}
