/**
 * Action Log
 *
 * Tracks all agent actions for transparency and dashboard building.
 * Writes to a JSON lines file for easy parsing.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  userId: string;

  // What happened
  action: ActionType;
  agent?: string;        // Which agent took the action (Luna, Ember, etc.)

  // Details
  details: Record<string, unknown>;

  // Result
  success: boolean;
  error?: string;

  // User involvement
  userRequested: boolean;  // Did user explicitly ask for this?
  userConfirmed?: boolean; // Did user confirm (for sensitive actions)?
}

export type ActionType =
  // Communication
  | 'email_sent'
  | 'whatsapp_sent'
  | 'telegram_message'

  // Calendar
  | 'calendar_query'
  | 'event_created'

  // Tasks
  | 'task_created'
  | 'task_completed'

  // Memory
  | 'memory_stored'
  | 'memory_retrieved'

  // Insights
  | 'insight_generated'
  | 'reflection_created'

  // System
  | 'agent_response'
  | 'tool_called'
  | 'error';

class ActionLogger {
  private logPath: string;
  private buffer: ActionLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(logDir?: string) {
    const dir = logDir || process.env.SONDER_DATA_DIR || join(process.cwd(), '.sonder');

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.logPath = join(dir, 'actions.jsonl');

    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Log an action
   */
  log(entry: Omit<ActionLogEntry, 'id' | 'timestamp'>): void {
    const fullEntry: ActionLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.buffer.push(fullEntry);

    // Also log to console for visibility
    const icon = fullEntry.success ? '✓' : '✗';
    const agent = fullEntry.agent ? `[${fullEntry.agent}]` : '';
    console.log(`[Action] ${icon} ${fullEntry.action} ${agent} user:${fullEntry.userId}`);

    // Flush immediately for important actions
    if (['email_sent', 'whatsapp_sent', 'event_created', 'task_created'].includes(fullEntry.action)) {
      this.flush();
    }
  }

  /**
   * Convenience: Log email sent
   */
  emailSent(opts: {
    userId: string;
    agent?: string;
    to: string[];
    subject: string;
    messageId?: string;
    userRequested: boolean;
    userConfirmed?: boolean;
  }): void {
    this.log({
      userId: opts.userId,
      action: 'email_sent',
      agent: opts.agent,
      details: {
        to: opts.to,
        subject: opts.subject,
        messageId: opts.messageId,
      },
      success: true,
      userRequested: opts.userRequested,
      userConfirmed: opts.userConfirmed,
    });
  }

  /**
   * Convenience: Log agent response
   */
  agentResponse(opts: {
    userId: string;
    agent: string;
    messagePreview: string;
    toolsUsed?: string[];
    responseTimeMs?: number;
  }): void {
    this.log({
      userId: opts.userId,
      action: 'agent_response',
      agent: opts.agent,
      details: {
        messagePreview: opts.messagePreview.slice(0, 100),
        toolsUsed: opts.toolsUsed,
        responseTimeMs: opts.responseTimeMs,
      },
      success: true,
      userRequested: true,
    });
  }

  /**
   * Convenience: Log tool call
   */
  toolCalled(opts: {
    userId: string;
    agent?: string;
    tool: string;
    args?: Record<string, unknown>;
    result?: unknown;
    success: boolean;
    error?: string;
  }): void {
    this.log({
      userId: opts.userId,
      action: 'tool_called',
      agent: opts.agent,
      details: {
        tool: opts.tool,
        args: opts.args,
        result: opts.result,
      },
      success: opts.success,
      error: opts.error,
      userRequested: true,
    });
  }

  /**
   * Convenience: Log insight generated
   */
  insightGenerated(opts: {
    userId: string;
    type: string;
    preview: string;
    agents?: string[];
  }): void {
    this.log({
      userId: opts.userId,
      action: 'insight_generated',
      details: {
        type: opts.type,
        preview: opts.preview.slice(0, 200),
        agents: opts.agents,
      },
      success: true,
      userRequested: false,
    });
  }

  /**
   * Get recent actions for a user
   */
  getRecent(userId: string, limit: number = 50): ActionLogEntry[] {
    this.flush(); // Ensure buffer is written

    if (!existsSync(this.logPath)) {
      return [];
    }

    const lines = readFileSync(this.logPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());

    const entries: ActionLogEntry[] = [];

    // Read from end for efficiency
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]) as ActionLogEntry;
        if (entry.userId === userId) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /**
   * Get all actions (for dashboard)
   */
  getAll(limit: number = 500): ActionLogEntry[] {
    this.flush();

    if (!existsSync(this.logPath)) {
      return [];
    }

    const lines = readFileSync(this.logPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());

    const entries: ActionLogEntry[] = [];

    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        entries.push(JSON.parse(lines[i]) as ActionLogEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /**
   * Get action stats
   */
  getStats(userId?: string): Record<string, number> {
    const entries = userId ? this.getRecent(userId, 1000) : this.getAll(1000);

    const stats: Record<string, number> = {};
    for (const entry of entries) {
      stats[entry.action] = (stats[entry.action] || 0) + 1;
    }

    return stats;
  }

  /**
   * Flush buffer to disk
   */
  private flush(): void {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
    appendFileSync(this.logPath, lines);
    this.buffer = [];
  }

  /**
   * Stop the logger
   */
  stop(): void {
    this.flush();
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Singleton instance
export const actionLog = new ActionLogger();

// Export class for custom instances
export { ActionLogger };
