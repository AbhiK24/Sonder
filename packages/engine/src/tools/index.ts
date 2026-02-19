/**
 * Agent Tools
 *
 * Real tools that agents can call to take actions.
 * Tools are executed and results fed back to the LLM.
 */

import { actionLog } from '../action-log.js';

// Tool definitions for LLM
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  result?: string;
  error?: string;
}

// Tool implementations
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

export interface ToolContext {
  userId: string;
  userName?: string;  // User's actual name for emails
  agentId?: string;
  agentName?: string;
  timezone?: string;
  emailDomain?: string;
  // Adapters
  emailAdapter?: {
    sendEmail: (opts: {
      from?: string;
      to: string[];
      cc?: string[];
      subject: string;
      body: string;
    }, confirmed: boolean) => Promise<{ success: boolean; data?: { messageId: string }; error?: string }>;
  };
  whatsappAdapter?: {
    sendMessage: (to: string, message: string) => Promise<{ success: boolean; error?: string }>;
  };
  engineContext?: {
    getCalendarEvents: () => any[];
    getEventsForDate: (date: Date) => any[];
    getTasks: () => any[];
    getTodayTasks: () => any[];
    getOverdueTasks: () => any[];
  };
  taskAdapter?: {
    createTask: (task: { content: string; dueDate?: Date; priority?: number }) => Promise<{ success: boolean; data?: any; error?: string }>;
    completeTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
    getTasks: (filter?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  };
  memory?: {
    remember: (text: string, metadata?: any) => Promise<void>;
    recall: (query: string, opts?: any) => Promise<{ entry: { text: string } }[]>;
  };
}

// =============================================================================
// Tool Definitions (for LLM)
// =============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // === Communication ===
  {
    name: 'send_email',
    description: 'Send an email. IMPORTANT: Write the actual email body - no placeholders like [Name]. Use the user\'s real name from context.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email(s), comma-separated' },
        cc: { type: 'string', description: 'CC email(s), comma-separated (optional)' },
        subject: { type: 'string', description: 'Clear subject line (40-50 chars). Be specific.' },
        body: { type: 'string', description: 'Complete email body. NO placeholders. Sign with user\'s actual name.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp message. Use when user asks to WhatsApp someone.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Phone number with country code (+91...)' },
        message: { type: 'string', description: 'Message text' },
      },
      required: ['to', 'message'],
    },
  },

  // === Calendar ===
  {
    name: 'get_calendar_events',
    description: 'Get calendar events for a date range. Use to check schedule, find free time, list meetings.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead (default 7)' },
        date: { type: 'string', description: 'Specific date (YYYY-MM-DD) or "today", "tomorrow"' },
      },
      required: [],
    },
  },
  {
    name: 'get_event_details',
    description: 'Get full details of a specific event including attendees and organizer.',
    parameters: {
      type: 'object',
      properties: {
        eventTitle: { type: 'string', description: 'Title or partial title of the event' },
        date: { type: 'string', description: 'Date of the event (YYYY-MM-DD)' },
      },
      required: ['eventTitle'],
    },
  },

  // === Tasks ===
  {
    name: 'create_task',
    description: 'Create a new task/todo. Use when user asks to add, create, or remember a task.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Task description' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD or "today", "tomorrow")' },
        priority: { type: 'number', description: 'Priority 1-4 (1=urgent, 4=low)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get current tasks/todos. Use to check what needs to be done.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '"today", "overdue", "all"', enum: ['today', 'overdue', 'all'] },
      },
      required: [],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as complete. Use when user says they finished something.',
    parameters: {
      type: 'object',
      properties: {
        taskContent: { type: 'string', description: 'Task description or partial match' },
      },
      required: ['taskContent'],
    },
  },

  // === Memory ===
  {
    name: 'remember',
    description: 'Store important information for later. Use for preferences, facts, context the user shares.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to remember' },
        type: { type: 'string', description: 'Type: "preference", "fact", "context", "goal"' },
      },
      required: ['text'],
    },
  },
  {
    name: 'recall',
    description: 'Search memory for relevant information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
      },
      required: ['query'],
    },
  },

  // === Time ===
  {
    name: 'get_current_time',
    description: 'Get the current date and time.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// =============================================================================
// Tool Executors
// =============================================================================

const toolExecutors: Record<string, ToolExecutor> = {
  // === Communication ===
  async send_email(args, context): Promise<ToolResult> {
    const { to, cc, subject, body } = args as { to: string; cc?: string; subject: string; body: string };

    if (!context.emailAdapter) {
      return { success: false, error: 'Email not configured. Ask user to set up RESEND_API_KEY.' };
    }

    // Parse multiple emails (comma or semicolon separated)
    const toList = to.split(/[,;]/).map(e => e.trim()).filter(e => e.includes('@'));
    const ccList = cc ? cc.split(/[,;]/).map(e => e.trim()).filter(e => e.includes('@')) : [];

    if (toList.length === 0) {
      return { success: false, error: 'No valid email addresses provided' };
    }

    try {
      // Build from address using agent name and configured domain
      const domain = context.emailDomain || 'resend.dev';
      const agentName = context.agentName || 'Chorus';
      const agentId = context.agentId || 'chorus';
      const fromAddress = domain !== 'resend.dev'
        ? `${agentName} <${agentId}@${domain}>`
        : `${agentName} <onboarding@resend.dev>`;

      const result = await context.emailAdapter.sendEmail({
        from: fromAddress,
        to: toList,
        cc: ccList.length > 0 ? ccList : undefined,
        subject,
        body,
      }, true);

      if (result.success) {
        actionLog.emailSent({
          userId: context.userId,
          agent: context.agentName,
          to: toList,
          subject,
          messageId: result.data?.messageId,
          userRequested: true,
          userConfirmed: true,
        });
        const ccMsg = ccList.length > 0 ? ` (CC: ${ccList.join(', ')})` : '';
        return { success: true, result: `Email sent to ${toList.join(', ')}${ccMsg}` };
      }
      return { success: false, error: result.error || 'Failed to send' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Email failed' };
    }
  },

  async send_whatsapp(args, context): Promise<ToolResult> {
    const { to, message } = args as { to: string; message: string };

    if (!context.whatsappAdapter) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    try {
      const result = await context.whatsappAdapter.sendMessage(to, message);
      if (result.success) {
        actionLog.log({
          userId: context.userId,
          action: 'whatsapp_sent',
          agent: context.agentName,
          details: { to, messagePreview: message.slice(0, 50) },
          success: true,
          userRequested: true,
        });
        return { success: true, result: `WhatsApp sent to ${to}` };
      }
      return { success: false, error: result.error || 'Failed to send' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'WhatsApp failed' };
    }
  },

  // === Calendar ===
  async get_calendar_events(args, context): Promise<ToolResult> {
    if (!context.engineContext) {
      return { success: false, error: 'Calendar not connected' };
    }

    const { days = 7, date } = args as { days?: number; date?: string };

    try {
      let events: any[];

      if (date) {
        const targetDate = parseDate(date, context.timezone);
        events = context.engineContext.getEventsForDate(targetDate);
      } else {
        events = context.engineContext.getCalendarEvents().slice(0, days * 3); // Rough limit
      }

      if (events.length === 0) {
        return { success: true, result: 'No events found in that time range.' };
      }

      const formatted = events.map(e => {
        const dateStr = e.startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = e.isAllDay ? 'All day' : e.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `- ${dateStr} ${timeStr}: ${e.title}`;
      }).join('\n');

      return { success: true, result: `Found ${events.length} events:\n${formatted}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Calendar query failed' };
    }
  },

  async get_event_details(args, context): Promise<ToolResult> {
    if (!context.engineContext) {
      return { success: false, error: 'Calendar not connected' };
    }

    const { eventTitle, date } = args as { eventTitle: string; date?: string };

    try {
      let events = context.engineContext.getCalendarEvents();

      if (date) {
        const targetDate = parseDate(date, context.timezone);
        events = context.engineContext.getEventsForDate(targetDate);
      }

      // Find matching event
      const match = events.find(e =>
        e.title.toLowerCase().includes(eventTitle.toLowerCase())
      );

      if (!match) {
        return { success: true, result: `No event found matching "${eventTitle}"` };
      }

      // Format full details
      const lines = [
        `**${match.title}**`,
        `Date: ${match.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
        `Time: ${match.isAllDay ? 'All day' : `${match.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${match.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}`,
      ];

      if (match.organizer) {
        lines.push(`Organizer: ${match.organizer.name || match.organizer.email} (${match.organizer.email})`);
      }

      if (match.attendees?.length) {
        const attendeeList = match.attendees.map((a: any) => {
          const status = a.status === 'accepted' ? '✓' : a.status === 'declined' ? '✗' : '?';
          return `${status} ${a.name || a.email}`;
        }).join(', ');
        lines.push(`Attendees: ${attendeeList}`);
      }

      if (match.location) lines.push(`Location: ${match.location}`);
      if (match.conferenceUrl) lines.push(`Meeting: ${match.conferenceUrl}`);

      return { success: true, result: lines.join('\n') };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get event details' };
    }
  },

  // === Tasks ===
  async create_task(args, context): Promise<ToolResult> {
    if (!context.taskAdapter) {
      return { success: false, error: 'Task manager not connected. Set TODOIST_API_KEY.' };
    }

    const { content, dueDate, priority } = args as { content: string; dueDate?: string; priority?: number };

    try {
      const task: any = { content };
      if (dueDate) task.dueDate = parseDate(dueDate, context.timezone);
      if (priority) task.priority = priority;

      const result = await context.taskAdapter.createTask(task);

      if (result.success) {
        actionLog.log({
          userId: context.userId,
          action: 'task_created',
          agent: context.agentName,
          details: { content, dueDate, priority },
          success: true,
          userRequested: true,
        });
        return { success: true, result: `Task created: "${content}"` };
      }
      return { success: false, error: result.error || 'Failed to create task' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Task creation failed' };
    }
  },

  async get_tasks(args, context): Promise<ToolResult> {
    if (!context.engineContext) {
      return { success: false, error: 'Task manager not connected' };
    }

    const { filter = 'today' } = args as { filter?: string };

    try {
      let tasks: any[];
      switch (filter) {
        case 'overdue':
          tasks = context.engineContext.getOverdueTasks();
          break;
        case 'all':
          tasks = context.engineContext.getTasks();
          break;
        default:
          tasks = context.engineContext.getTodayTasks();
      }

      if (tasks.length === 0) {
        return { success: true, result: `No ${filter} tasks found.` };
      }

      const formatted = tasks.map(t => `- ${t.content}${t.dueDate ? ` (due: ${t.dueDate.toLocaleDateString()})` : ''}`).join('\n');
      return { success: true, result: `${tasks.length} ${filter} tasks:\n${formatted}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get tasks' };
    }
  },

  async complete_task(args, context): Promise<ToolResult> {
    if (!context.taskAdapter) {
      return { success: false, error: 'Task manager not connected' };
    }

    const { taskContent } = args as { taskContent: string };

    // For now, just acknowledge - Todoist API needs task ID
    // TODO: Search tasks and complete by ID
    actionLog.log({
      userId: context.userId,
      action: 'task_completed',
      agent: context.agentName,
      details: { taskContent },
      success: true,
      userRequested: true,
    });

    return { success: true, result: `Noted "${taskContent}" as complete! Great job.` };
  },

  // === Memory ===
  async remember(args, context): Promise<ToolResult> {
    if (!context.memory) {
      return { success: false, error: 'Memory not available' };
    }

    const { text, type = 'context' } = args as { text: string; type?: string };

    try {
      await context.memory.remember(text, {
        type,
        userId: context.userId,
        agentId: context.agentId,
      });

      actionLog.log({
        userId: context.userId,
        action: 'memory_stored',
        agent: context.agentName,
        details: { textPreview: text.slice(0, 50), type },
        success: true,
        userRequested: true,
      });

      return { success: true, result: `Remembered: "${text.slice(0, 50)}..."` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Memory failed' };
    }
  },

  async recall(args, context): Promise<ToolResult> {
    if (!context.memory) {
      return { success: false, error: 'Memory not available' };
    }

    const { query } = args as { query: string };

    try {
      const results = await context.memory.recall(query, { userId: context.userId, limit: 5 });

      if (results.length === 0) {
        return { success: true, result: 'No relevant memories found.' };
      }

      const formatted = results.map(r => `- ${r.entry.text}`).join('\n');
      return { success: true, result: `Found ${results.length} relevant memories:\n${formatted}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Recall failed' };
    }
  },

  // === Time ===
  async get_current_time(args, context): Promise<ToolResult> {
    const tz = context.timezone || 'UTC';
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return { success: true, result: `${formatted} (${tz})` };
  },
};

// Helper: Parse date strings
function parseDate(dateStr: string, timezone?: string): Date {
  const lower = dateStr.toLowerCase();
  const now = new Date();

  if (lower === 'today') return now;
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // Try parsing YYYY-MM-DD
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  return now;
}

// =============================================================================
// Tool Execution
// =============================================================================

export async function executeTool(
  toolCall: ToolCall,
  context: ToolContext
): Promise<ToolResult> {
  const executor = toolExecutors[toolCall.name];

  if (!executor) {
    return { success: false, error: `Unknown tool: ${toolCall.name}` };
  }

  console.log(`[Tool] Executing: ${toolCall.name}`, toolCall.arguments);

  try {
    const result = await executor(toolCall.arguments, context);
    console.log(`[Tool] Result: ${result.success ? '✓' : '✗'} ${result.result || result.error}`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Tool execution failed';
    console.error(`[Tool] Error:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Format tools for LLM prompt (for models that don't support native tool calling)
 */
export function formatToolsForPrompt(userName?: string): string {
  return `## Available Tools
You can use these tools by responding with a JSON tool call. Format:
\`\`\`tool
{"name": "tool_name", "arguments": {...}}
\`\`\`

${userName ? `## User Info\nUser's name: ${userName} (use this in emails, not placeholders!)` : ''}

Tools:
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}
  Parameters: ${Object.entries(t.parameters.properties).map(([k, v]) => `${k} (${v.type}): ${v.description}`).join(', ')}`).join('\n\n')}

## CRITICAL Rules:
1. Only use tools when user explicitly asks for an action
2. Wait for tool result before confirming to user
3. NEVER claim to have done something without calling the tool
4. For emails: Write complete body with NO placeholders. Sign with "${userName || 'user\'s actual name'}"`;
}

/**
 * Parse tool calls from LLM response
 */
export function parseToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Look for ```tool blocks
  const toolBlockRegex = /```tool\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = toolBlockRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.arguments) {
        toolCalls.push(parsed as ToolCall);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Also check for inline JSON tool calls
  const inlineRegex = /\{"name":\s*"(\w+)",\s*"arguments":\s*(\{[^}]+\})\}/g;
  while ((match = inlineRegex.exec(response)) !== null) {
    try {
      toolCalls.push({
        name: match[1],
        arguments: JSON.parse(match[2]),
      });
    } catch {
      // Invalid JSON, skip
    }
  }

  return toolCalls;
}

/**
 * Remove tool call blocks from response (for display to user)
 */
export function removeToolCallsFromResponse(response: string): string {
  return response
    .replace(/```tool\s*\n?[\s\S]*?```/g, '')
    .replace(/\{"name":\s*"\w+",\s*"arguments":\s*\{[^}]+\}\}/g, '')
    .trim();
}
