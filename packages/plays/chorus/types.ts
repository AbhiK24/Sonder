/**
 * Chorus Play Types
 *
 * Five voices harmonizing to support your ADHD brain.
 */

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

export type AgentTool =
  | 'memory'           // Access to conversation history, facts, patterns
  | 'tasks'            // Read/create tasks in Todoist
  | 'calendar'         // Read/create calendar events
  | 'email_read'       // Read user's inbox
  | 'email_draft'      // Draft emails in user's account
  | 'email_send'       // Send as agent (proactive outreach)
  | 'patterns'         // Access to detected patterns about user
  | 'triggers'         // Create/manage proactive triggers
  | 'idle_thoughts'    // Generate idle thoughts
  | 'celebration';     // Track and celebrate wins

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
