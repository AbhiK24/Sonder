/**
 * Chorus Play Types
 *
 * Five voices harmonizing to support your ADHD brain.
 *
 * Imports core types from engine, extends with Chorus-specific types.
 */

// Import from engine (relative path for monorepo compatibility)
import type { AgentTool } from '../../engine/src/plays/types.js';

// Re-export for convenience
export type { AgentTool };

// =============================================================================
// Agent Types
// =============================================================================

export type ChorusAgentId = 'luna' | 'ember' | 'sage' | 'joy' | 'echo';

export interface ChorusAgent {
  id: ChorusAgentId;
  name: string;
  emoji: string;
  role: string;
  description: string;

  // The core prompt that defines this agent
  systemPrompt: string;

  // What this agent is good at
  strengths: string[];

  // What tools this agent prefers
  preferredTools: AgentTool[];

  // When this agent should speak up
  speaksWhen: string[];

  // How this agent talks
  voiceTraits: string[];
}

// =============================================================================
// Discussion Types
// =============================================================================

export interface ChorusDiscussion {
  topic: string;
  participants: ChorusAgentId[];
  turns: DiscussionTurn[];
  conclusion?: string;
  actionItems?: string[];
}

export interface DiscussionTurn {
  agentId: ChorusAgentId;
  content: string;
  timestamp: Date;
}

// =============================================================================
// Proactive Types
// =============================================================================

export interface ProactiveCheckIn {
  type: 'morning' | 'midday' | 'evening' | 'weekly';
  leadAgent: ChorusAgentId;
  supportingAgents?: ChorusAgentId[];
  message: string;
}

export interface CelebrationMoment {
  what: string;
  significance: 'small' | 'medium' | 'big';
  celebratedBy: ChorusAgentId;
  message: string;
}
