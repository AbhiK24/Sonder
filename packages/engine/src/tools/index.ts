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
  agentId?: string;
  agentName?: string;
  // Adapters
  emailAdapter?: {
    sendEmail: (opts: {
      from?: string;
      to: string[];
      subject: string;
      body: string;
    }, confirmed: boolean) => Promise<{ success: boolean; data?: { messageId: string }; error?: string }>;
  };
  whatsappAdapter?: {
    sendMessage: (to: string, message: string) => Promise<{ success: boolean; error?: string }>;
  };
  calendarAdapter?: {
    getEvents: (start: Date, end: Date) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  };
}

// =============================================================================
// Tool Definitions (for LLM)
// =============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'send_email',
    description: 'Send an email to someone. Use this when the user asks you to send an email or message someone via email.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Email address to send to',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body text',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp message to someone. Use this when the user asks you to message someone on WhatsApp.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Phone number with country code (e.g., +919876543210)',
        },
        message: {
          type: 'string',
          description: 'Message to send',
        },
      },
      required: ['to', 'message'],
    },
  },
];

// =============================================================================
// Tool Executors
// =============================================================================

const toolExecutors: Record<string, ToolExecutor> = {
  async send_email(args, context): Promise<ToolResult> {
    const { to, subject, body } = args as { to: string; subject: string; body: string };

    if (!context.emailAdapter) {
      return { success: false, error: 'Email not configured' };
    }

    // Validate email
    if (!to.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }

    try {
      const result = await context.emailAdapter.sendEmail({
        to: [to],
        subject,
        body,
      }, true); // Auto-confirm for now

      if (result.success) {
        // Log the action
        actionLog.emailSent({
          userId: context.userId,
          agent: context.agentName,
          to: [to],
          subject,
          messageId: result.data?.messageId,
          userRequested: true,
          userConfirmed: true,
        });

        return {
          success: true,
          result: `Email sent successfully to ${to}`,
        };
      } else {
        return { success: false, error: result.error || 'Failed to send email' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email failed',
      };
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

        return {
          success: true,
          result: `WhatsApp message sent to ${to}`,
        };
      } else {
        return { success: false, error: result.error || 'Failed to send WhatsApp' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WhatsApp failed',
      };
    }
  },
};

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
export function formatToolsForPrompt(): string {
  return `## Available Tools
You can use these tools by responding with a JSON tool call. Format:
\`\`\`tool
{"name": "tool_name", "arguments": {...}}
\`\`\`

Tools:
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}
  Parameters: ${Object.entries(t.parameters.properties).map(([k, v]) => `${k} (${v.type}): ${v.description}`).join(', ')}`).join('\n\n')}

IMPORTANT: Only use tools when the user explicitly asks you to take an action (send email, message someone, etc.).
If you use a tool, wait for the result before confirming the action to the user.
Do NOT claim to have done something unless you actually called the tool and got a success result.`;
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
