/**
 * Agent Tools
 *
 * Real tools that agents can call to take actions.
 * Tools are executed and results fed back to the LLM.
 */

import { actionLog } from '../action-log.js';
import {
  getGoogleOAuth,
  getTodayEvents,
  getUpcomingEvents,
  createCalendarEvent,
  updateCalendarEvent,
  searchCalendarEvents,
  findFreeTime,
  getRecentEmails,
  searchEmails,
  readEmail,
  getUnreadCount,
  summarizeEmails,
  findEmailReplies,
  sendGmailEmail,
  getPendingTasks,
  createTask as createGoogleTask,
} from '../integrations/index.js';
import { resolveVenue, addVenue, listVenuesFormatted, Venue } from '../integrations/venues.js';
import {
  addContact,
  addInteraction,
  findContact,
  findContactWithDisambiguation,
  searchContacts,
  resolveContact,
  listContactsFormatted,
  getContactsByCategory,
  getContactById,
  getContacts,
  getInteractionHistory,
  markContacted,
  recordEmailSent,
  recordCalendarEvent,
  formatContact,
  Contact,
  ContactCategory,
} from '../integrations/contacts.js';
import { webSearch, formatSearchResults } from '../integrations/search.js';
import { summarizeLink, fetchLinkContent } from '../integrations/link-summarizer.js';

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
  userEmail?: string; // User's email (for calendar invites, etc.)
  agentId?: string;
  agentName?: string;
  timezone?: string;
  emailDomain?: string;
  // WhatsApp
  whatsappAllowlist?: string[];  // Numbers the agent can message
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
  reminderEngine?: {
    createReminder: (userId: string, content: string, time: string, agentId?: string) => { reminder: { id: string; content: string; dueAt: Date }; interpretation: string };
    getReminders: (userId: string) => { id: string; content: string; dueAt: Date; fired: boolean }[];
    cancelReminderByContent: (userId: string, search: string) => { id: string; content: string } | undefined;
  };
  // LLM for summarization tasks
  llmFn?: (prompt: string) => Promise<string>;
  // Tool Forge for self-extending capabilities
  toolForge?: {
    buildTool: (request: { userId: string; name: string; description: string; requirements: string; agentId?: string }) => Promise<{ success: boolean; tool?: any; error?: string; logs?: string[] }>;
    testTool: (tool: any) => Promise<{ passed: boolean; output: string }[]>;
    improveTool: (tool: any, testResults: { passed: boolean; output: string }[]) => Promise<{ success: boolean; tool?: any; error?: string }>;
    activateTool: (userId: string, toolName: string) => Promise<boolean>;
    disableTool: (userId: string, toolName: string) => Promise<boolean>;
    submitTool: (userId: string, toolName: string) => Promise<boolean>;
    getUserTools: (userId: string) => any[];
    getUserTool: (userId: string, toolName: string) => any | undefined;
  };
}

// =============================================================================
// Tool Definitions (for LLM)
// =============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // === Communication ===
  {
    name: 'send_email',
    description: 'Send an email. System will ask user for confirmation before sending. Signature is auto-added.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email or name (will resolve from contacts). Comma-separated for multiple.' },
        cc: { type: 'string', description: 'CC recipients (optional)' },
        subject: { type: 'string', description: 'Clear subject line' },
        body: { type: 'string', description: 'Complete email body. NO placeholders. Signature auto-added, don\'t include one.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp message. System will ask user for confirmation before sending.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Phone number with country code (+91...) or contact name' },
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

  // === Google Calendar ===
  {
    name: 'google_get_today_events',
    description: "Get today's events from Google Calendar. Use when user asks about their schedule today.",
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'google_get_upcoming_events',
    description: 'Get upcoming events from Google Calendar for the next N days.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead (default 7)' },
      },
      required: [],
    },
  },
  {
    name: 'google_create_event',
    description: 'Create a calendar event. System will ask user for confirmation before creating.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start time (ISO format or natural like "tomorrow 3pm")' },
        durationMinutes: { type: 'number', description: 'Duration in minutes (default 60)' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Venue name or address (will resolve from saved venues)' },
        invitees: { type: 'string', description: 'Names or emails to invite (will resolve from contacts)' },
      },
      required: ['title', 'startTime'],
    },
  },
  {
    name: 'google_find_free_time',
    description: 'Find available time slots in the calendar for a given day.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to check (YYYY-MM-DD or "today", "tomorrow")' },
        durationMinutes: { type: 'number', description: 'Minimum slot duration needed (default 60)' },
      },
      required: [],
    },
  },
  {
    name: 'google_search_events',
    description: 'Search for calendar events by title or keyword. Returns event IDs needed for updating.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (event title, description, etc.)' },
        days: { type: 'number', description: 'Days to search ahead (default 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_update_event',
    description: 'Update/edit an existing calendar event. First use google_search_events to find the event ID. System will ask for confirmation before updating.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Event ID (from google_search_events)' },
        title: { type: 'string', description: 'New title (optional)' },
        startTime: { type: 'string', description: 'New start time (optional)' },
        endTime: { type: 'string', description: 'New end time (optional)' },
        location: { type: 'string', description: 'New location (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        addInvitees: { type: 'string', description: 'Additional invitees to add, comma-separated emails (optional)' },
      },
      required: ['eventId'],
    },
  },

  // === Gmail ===
  {
    name: 'google_get_emails',
    description: 'Get recent emails from Gmail. Can filter to unread only.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of emails to fetch (default 10)' },
        unreadOnly: { type: 'boolean', description: 'Only get unread emails' },
      },
      required: [],
    },
  },
  {
    name: 'google_search_emails',
    description: 'Search emails in Gmail. Use Gmail search syntax.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "from:john", "subject:meeting", "is:unread")' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_read_email',
    description: 'Read the full content of a specific email.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Email message ID' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'google_unread_count',
    description: 'Get the count of unread emails.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'google_summarize_emails',
    description: 'Get a summary of recent emails grouped by sender.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of emails to summarize (default 10)' },
        query: { type: 'string', description: 'Optional search filter' },
      },
      required: [],
    },
  },
  {
    name: 'google_find_replies',
    description: `Find replies or follow-up emails in a thread using smart fuzzy search.
IMPORTANT: Don't just pass a single word - provide CONTEXT:
- Include relevant keywords from the conversation (person names, topics, projects)
- Include the contact's email if known
- Be specific: "meeting with John about Q4 budget" not just "meeting"
Examples:
- Good: subject="Q4 budget review", keywords=["John", "finance", "quarterly"], contactEmail="john@company.com"
- Bad: subject="meeting"`,
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Subject or key topic to search for (be specific, include context)' },
        contactEmail: { type: 'string', description: 'Email address to search conversations with' },
        keywords: { type: 'string', description: 'Comma-separated context keywords: names, topics, projects (e.g. "John,budget,Q4")' },
        daysBack: { type: 'number', description: 'How many days back to search (default 14)' },
      },
      required: [],
    },
  },

  // === Google Tasks ===
  {
    name: 'google_get_tasks',
    description: 'Get pending tasks from Google Tasks.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'google_create_task',
    description: 'Create a new task in Google Tasks.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Task notes/description' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      },
      required: ['title'],
    },
  },

  // === Venues ===
  {
    name: 'save_venue',
    description: 'Save a frequently used venue/location for quick reference. Use when user mentions a place they often go to.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full venue name (e.g., "Bloom Hotel Jayanagar")' },
        shortName: { type: 'string', description: 'Short alias (e.g., "Bloom")' },
        address: { type: 'string', description: 'Full address' },
        type: { type: 'string', description: 'Type: cafe, restaurant, office, hotel, coworking, home, other' },
      },
      required: ['name', 'address'],
    },
  },
  {
    name: 'list_venues',
    description: 'List all saved venues the user frequently visits.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'lookup_venue',
    description: 'Look up a venue by name to get its full address. Use before creating calendar events to resolve location.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Venue name or partial name to search' },
      },
      required: ['query'],
    },
  },

  // === Contacts ===
  {
    name: 'save_contact',
    description: 'Save a person as a contact. Use when user mentions someone with their email, phone, or describes who they are.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        nickname: { type: 'string', description: 'Short name or alias (optional)' },
        email: { type: 'string', description: 'Email address (optional)' },
        phone: { type: 'string', description: 'Phone number with country code (optional)' },
        category: { type: 'string', description: 'Relationship type', enum: ['friend', 'family', 'business', 'acquaintance'] },
        company: { type: 'string', description: 'Company/organization they work at (optional)' },
        role: { type: 'string', description: 'Their job title or role (optional)' },
        relationship: { type: 'string', description: 'How user knows them, e.g. "college friend", "client", "manager at X" (optional)' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'list_contacts',
    description: 'List all saved contacts grouped by category (friend, family, business, acquaintance).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'lookup_contact',
    description: 'Look up a contact by name, email, or phone to get their full info. Use before sending emails/messages to resolve recipient.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email, or phone to search for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_contacts',
    description: 'Search contacts by any field (name, company, role, notes, etc.).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_contact',
    description: 'Add a new contact to your contacts list. Use when user mentions a person they want to remember.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the contact' },
        email: { type: 'string', description: 'Email address (optional)' },
        phone: { type: 'string', description: 'Phone number with country code (optional)' },
        category: { type: 'string', description: 'Category: friend, family, business, or acquaintance' },
        company: { type: 'string', description: 'Company or organization (optional)' },
        role: { type: 'string', description: 'Job title or role (optional)' },
        relationship: { type: 'string', description: 'How user knows them, e.g. "college friend", "client" (optional)' },
        notes: { type: 'string', description: 'Any additional notes (optional)' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'get_contact_history',
    description: 'Get full interaction history with a contact - all meetings, emails, venues where you met.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name (use full name if ambiguous)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_contact_note',
    description: 'Add a note or interaction to a contact\'s history. Use when user mentions meeting someone, talking to someone, etc.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name' },
        note: { type: 'string', description: 'What happened - e.g. "Had coffee and discussed project timeline"' },
        venue: { type: 'string', description: 'Where it happened (optional)' },
        type: { type: 'string', description: 'Type of interaction', enum: ['meeting', 'call', 'note'] },
      },
      required: ['name', 'note'],
    },
  },

  // === Web Search ===
  {
    name: 'web_search',
    description: `Search the web for current information, news, facts, or anything the user asks about.
Use this when:
- User asks about current events, news, or recent developments
- User needs factual information you're unsure about
- User asks "what is X" or "how to Y" questions
- User wants to know about a person, company, topic, etc.
- You need to verify or look up information
Examples: "What's the weather in Mumbai?", "Latest news about AI", "How to make pasta"`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query - be specific and include context' },
      },
      required: ['query'],
    },
  },

  // === Link Summarization ===
  {
    name: 'summarize_link',
    description: `Summarize content from a URL - articles, blog posts, tweets, X/Twitter threads, YouTube videos.
Use this when:
- User shares a link and asks "what's this about?" or "summarize this"
- User pastes an article/tweet URL they want summarized
- User shares a Twitter/X thread and wants the key points
Examples: "Summarize this article https://...", "What does this tweet say?", "TLDR this thread"`,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to summarize (article, tweet, YouTube video)' },
      },
      required: ['url'],
    },
  },

  // === Tool Forge (Self-Extension) ===
  {
    name: 'build_tool',
    description: `Build a new custom tool when user requests functionality that doesn't exist.
Use when:
- User asks for something like "Can you search my Notion?" or "Add a tool for..."
- User wants to automate a specific workflow you can't do with existing tools
- A capability is missing that would be useful for the user

This creates a custom tool that persists and can be used in future conversations.
IMPORTANT: Always confirm with user before building. Show them what you plan to build.`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name in snake_case (e.g., notion_search, github_issues)' },
        description: { type: 'string', description: 'Clear description of what the tool does' },
        requirements: { type: 'string', description: 'Detailed requirements from the user conversation' },
      },
      required: ['name', 'description', 'requirements'],
    },
  },
  {
    name: 'list_custom_tools',
    description: `List the user's custom tools that have been built for them.
Shows tool name, description, and status (active/disabled).`,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'disable_custom_tool',
    description: `Disable a custom tool that the user no longer wants to use.
The tool can be re-enabled later.`,
    parameters: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Name of the tool to disable' },
      },
      required: ['toolName'],
    },
  },
  {
    name: 'submit_tool_for_review',
    description: `Submit a user's custom tool to be reviewed for global availability.
If approved, other Sonder users can use this tool too.`,
    parameters: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Name of the tool to submit' },
      },
      required: ['toolName'],
    },
  },
  {
    name: 'get_whatsapp_contacts',
    description: 'Get list of contacts that can receive WhatsApp messages. Use this before sending WhatsApp to see who you can message.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // === Reminders ===
  {
    name: 'create_reminder',
    description: `Create a reminder for the user at a specific time. Use when user says "remind me to...", "don't let me forget...", etc.`,
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remind about (e.g., "call mom", "take medicine")' },
        time: { type: 'string', description: 'When to remind (e.g., "in 30 minutes", "at 5pm", "tomorrow at 9am", "in 2 hours")' },
      },
      required: ['content', 'time'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List all pending reminders for the user.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a reminder. Can search by content.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term to find the reminder (e.g., "mom", "medicine")' },
      },
      required: ['search'],
    },
  },
];

// =============================================================================
// Tool Executors
// =============================================================================

export const toolExecutors: Record<string, ToolExecutor> = {
  // === Communication ===
  async send_email(args, context): Promise<ToolResult> {
    const { to, cc, subject, body } = args as { to: string; cc?: string; subject: string; body: string };

    // Check if we have any way to send email
    const google = getGoogleOAuth();
    const canUseGmail = google?.isAuthenticated();

    if (!canUseGmail && !context.emailAdapter) {
      return { success: false, error: 'Email not configured. Connect Google or set up Resend.' };
    }

    // Resolve contacts with disambiguation support
    const resolveRecipient = (r: string): { email: string | null; needsDisambiguation?: boolean; message?: string } => {
      const trimmed = r.trim();
      if (trimmed.includes('@')) return { email: trimmed };

      // Try to resolve as contact name
      const resolved = resolveContact(trimmed);

      // Check for disambiguation needed
      if (resolved.needsDisambiguation && resolved.disambiguationMessage) {
        return {
          email: null,
          needsDisambiguation: true,
          message: resolved.disambiguationMessage,
        };
      }

      if (resolved.resolved && resolved.email) {
        return { email: resolved.email };
      }

      return { email: null };
    };

    // Check for disambiguation needs first
    const toRecipients = to.split(/[,;]/).map(r => r.trim()).filter(Boolean);
    for (const recipient of toRecipients) {
      const result = resolveRecipient(recipient);
      if (result.needsDisambiguation && result.message) {
        return { success: false, error: result.message };
      }
    }

    // Parse and resolve recipients
    const toList = toRecipients.map(r => resolveRecipient(r).email).filter((e): e is string => e !== null);
    const ccList = cc ? cc.split(/[,;]/).map(r => resolveRecipient(r.trim()).email).filter((e): e is string => e !== null) : [];

    if (toList.length === 0) {
      return { success: false, error: 'No valid email addresses provided' };
    }

    try {
      const userName = context.userName || 'User';
      let sentVia = '';

      // Prefer Gmail (sends from user's actual email address)
      console.log(`[send_email] Gmail available: ${canUseGmail}`);
      if (canUseGmail) {
        console.log(`[send_email] Trying Gmail...`);
        const result = await sendGmailEmail({
          to: [...toList, ...ccList],
          subject,
          body: body,  // Gmail sends from their email, no need for special signature
        });
        console.log(`[send_email] Gmail result: ${result.success}, error: ${result.error || 'none'}`);

        if (result.success) {
          sentVia = 'Gmail';
          actionLog.emailSent({
            userId: context.userId,
            agent: context.agentName,
            to: toList,
            subject,
            messageId: result.data?.messageId,
            userRequested: true,
            userConfirmed: true,
          });

          // Record interaction in contacts
          recordEmailSent({
            toEmails: [...toList, ...ccList],
            subject,
            agentId: context.agentId,
          });

          const ccMsg = ccList.length > 0 ? ` (CC: ${ccList.join(', ')})` : '';
          return { success: true, result: `Email sent via Gmail to ${toList.join(', ')}${ccMsg}` };
        }
        // Gmail failed, try Resend as fallback
        if (!context.emailAdapter) {
          return { success: false, error: result.error || 'Gmail send failed' };
        }
      }

      // Fallback to Resend
      const domain = context.emailDomain || 'resend.dev';
      const fromAddress = domain !== 'resend.dev'
        ? `${userName} via Sonder <sonder@${domain}>`
        : `${userName} via Sonder <onboarding@resend.dev>`;

      // Add signature for Resend (since it's not from their email)
      const signedBody = `${body}\n\n—\n${userName} via Sonder`;

      const result = await context.emailAdapter!.sendEmail({
        from: fromAddress,
        to: toList,
        cc: ccList.length > 0 ? ccList : undefined,
        subject,
        body: signedBody,
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

        // Record interaction in contacts
        recordEmailSent({
          toEmails: [...toList, ...ccList],
          subject,
          agentId: context.agentId,
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

  // === Google Calendar ===
  async google_get_today_events(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const result = await getTodayEvents();
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_get_upcoming_events(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { days = 7 } = args as { days?: number };
    const result = await getUpcomingEvents({ days });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_create_event(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { title, startTime, durationMinutes = 60, description, location, invitees } = args as {
      title: string;
      startTime: string;
      durationMinutes?: number;
      description?: string;
      location?: string;
      invitees?: string;
    };

    // Parse start time
    const start = parseDateTime(startTime, context.timezone);

    // Parse invitees - auto-add user's email so they get invited to their own events
    let inviteeList = invitees ? invitees.split(',').map(e => e.trim()).filter(e => e.includes('@')) : [];

    // Always invite the user to their own events
    if (context.userEmail && !inviteeList.includes(context.userEmail)) {
      inviteeList.push(context.userEmail);
    }

    // Try to resolve venue if location provided
    let resolvedLocation = location;
    let venueNote = '';
    let resolvedVenue: { name: string; address: string } | undefined;
    if (location) {
      const resolved = resolveVenue(location);
      if (resolved.resolved && resolved.venue) {
        resolvedLocation = resolved.venue.address;
        resolvedVenue = { name: resolved.venue.name, address: resolved.venue.address };
        venueNote = ` (resolved "${location}" to ${resolved.venue.name})`;
      }
    }

    const result = await createCalendarEvent({
      title,
      startTime: start,
      durationMinutes,
      description,
      location: resolvedLocation,
      invitees: inviteeList,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    actionLog.log({
      userId: context.userId,
      action: 'event_created',
      agent: context.agentName,
      details: { title, startTime: start.toISOString(), invitees: inviteeList, location: resolvedLocation },
      success: true,
      userRequested: true,
    });

    // Record interaction in contacts for each attendee
    if (inviteeList.length > 0) {
      recordCalendarEvent({
        attendeeEmails: inviteeList,
        eventTitle: title,
        eventDate: start,
        venue: resolvedVenue?.name,
        venueAddress: resolvedLocation,
        calendarEventId: result.data?.id,
        agentId: context.agentId,
      });
    }

    return { success: true, result: result.message + venueNote };
  },

  async google_find_free_time(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { date, durationMinutes = 60 } = args as { date?: string; durationMinutes?: number };

    const targetDate = date ? parseDate(date, context.timezone) : new Date();
    const result = await findFreeTime({ date: targetDate, durationMinutes });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_search_events(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { query, days = 30 } = args as { query: string; days?: number };
    const result = await searchCalendarEvents({ query, days });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_update_event(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { eventId, title, startTime, endTime, location, description, addInvitees } = args as {
      eventId: string;
      title?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      description?: string;
      addInvitees?: string;
    };

    const inviteeList = addInvitees ? addInvitees.split(',').map(e => e.trim()).filter(e => e.includes('@')) : undefined;

    const result = await updateCalendarEvent({
      eventId,
      title,
      startTime: startTime ? parseDateTime(startTime, context.timezone) : undefined,
      endTime: endTime ? parseDateTime(endTime, context.timezone) : undefined,
      location,
      description,
      addInvitees: inviteeList,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    actionLog.log({
      userId: context.userId,
      action: 'event_created',  // Using existing action type
      agent: context.agentName,
      details: { eventId, title, location, addInvitees: inviteeList, action: 'update' },
      success: true,
      userRequested: true,
    });

    return { success: true, result: result.message };
  },

  // === Gmail ===
  async google_get_emails(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { count = 10, unreadOnly = false } = args as { count?: number; unreadOnly?: boolean };
    const result = await getRecentEmails({ count, unreadOnly });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_search_emails(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { query, maxResults = 10 } = args as { query: string; maxResults?: number };
    const result = await searchEmails(query, maxResults);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_read_email(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { messageId } = args as { messageId: string };
    const result = await readEmail(messageId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_unread_count(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const result = await getUnreadCount();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_summarize_emails(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { count = 10, query } = args as { count?: number; query?: string };
    const result = await summarizeEmails({ count, query });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_find_replies(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { subject, contactEmail, keywords: keywordsStr, daysBack } = args as {
      subject?: string;
      contactEmail?: string;
      keywords?: string;
      daysBack?: number;
    };

    if (!subject && !contactEmail && !keywordsStr) {
      return { success: false, error: 'Provide context to search: subject, contact email, or keywords. Be specific!' };
    }

    // Parse comma-separated keywords into array
    const keywords = keywordsStr
      ? keywordsStr.split(',').map(k => k.trim()).filter(k => k.length > 0)
      : undefined;

    const result = await findEmailReplies({ subject, contactEmail, keywords, daysBack });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  // === Google Tasks ===
  async google_get_tasks(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const result = await getPendingTasks();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.message };
  },

  async google_create_task(args, context): Promise<ToolResult> {
    const google = getGoogleOAuth();
    if (!google?.isAuthenticated()) {
      return { success: false, error: 'Google not connected. Please sign in with Google in settings.' };
    }

    const { title, notes, dueDate } = args as { title: string; notes?: string; dueDate?: string };

    const result = await createGoogleTask({
      title,
      notes,
      dueDate: dueDate ? parseDate(dueDate, context.timezone) : undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    actionLog.log({
      userId: context.userId,
      action: 'task_created',
      agent: context.agentName,
      details: { title, notes, dueDate, source: 'google_tasks' },
      success: true,
      userRequested: true,
    });

    return { success: true, result: result.message };
  },

  // === Venues ===
  async save_venue(args, context): Promise<ToolResult> {
    const { name, shortName, address, type } = args as {
      name: string;
      shortName?: string;
      address: string;
      type?: string;
    };

    try {
      addVenue({
        name,
        shortName,
        address,
        type: type as Venue['type'],
      });

      const alias = shortName ? ` (alias: "${shortName}")` : '';
      return { success: true, result: `Saved venue "${name}"${alias} at ${address}. I'll remember this for future events.` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save venue' };
    }
  },

  async list_venues(args, context): Promise<ToolResult> {
    const result = listVenuesFormatted();
    return { success: true, result };
  },

  async lookup_venue(args, context): Promise<ToolResult> {
    const { query } = args as { query: string };

    const resolved = resolveVenue(query);

    if (resolved.resolved && resolved.venue) {
      return {
        success: true,
        result: `Found: "${resolved.venue.name}" at ${resolved.venue.address}`,
      };
    }

    return {
      success: true,
      result: `No saved venue found for "${query}". Using as-is. Consider saving it with save_venue if it's a frequent location.`,
    };
  },

  // === Contacts ===
  async save_contact(args, context): Promise<ToolResult> {
    const { name, nickname, email, phone, category, company, role, relationship } = args as {
      name: string;
      nickname?: string;
      email?: string;
      phone?: string;
      category: ContactCategory;
      company?: string;
      role?: string;
      relationship?: string;
    };

    try {
      const contact = addContact({
        name,
        nickname,
        email,
        phone,
        category,
        company,
        role,
        relationship,
      });

      const details = [
        email ? `email: ${email}` : null,
        phone ? `phone: ${phone}` : null,
        relationship ? `(${relationship})` : null,
      ].filter(Boolean).join(', ');

      return {
        success: true,
        result: `Saved contact: ${name}${nickname ? ` (${nickname})` : ''} as ${category}${details ? ` - ${details}` : ''}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save contact' };
    }
  },

  async list_contacts(args, context): Promise<ToolResult> {
    const result = listContactsFormatted();
    return { success: true, result };
  },

  async lookup_contact(args, context): Promise<ToolResult> {
    const { query } = args as { query: string };

    const resolved = resolveContact(query);

    // Check if disambiguation is needed
    if (resolved.needsDisambiguation && resolved.disambiguationMessage) {
      return {
        success: true,
        result: resolved.disambiguationMessage,
      };
    }

    if (resolved.resolved && resolved.contact) {
      // Use formatContact with history
      const formatted = formatContact(resolved.contact, true);
      return {
        success: true,
        result: formatted,
      };
    }

    return {
      success: true,
      result: `No contact found for "${query}". Would you like me to save them? Just tell me their details.`,
    };
  },

  async search_contacts(args, context): Promise<ToolResult> {
    const { query } = args as { query: string };

    const contacts = searchContacts(query);

    if (contacts.length === 0) {
      return { success: true, result: `No contacts found matching "${query}".` };
    }

    const formatted = contacts.slice(0, 10).map(c => {
      const info = [c.email, c.phone].filter(Boolean).join(', ');
      const interactions = c.interactionCount > 0 ? ` [${c.interactionCount} interactions]` : '';
      return `• ${c.name} (${c.category})${info ? `: ${info}` : ''}${interactions}`;
    }).join('\n');

    return {
      success: true,
      result: `Found ${contacts.length} contact(s):\n${formatted}`,
    };
  },

  async add_contact(args, context): Promise<ToolResult> {
    const { name, email, phone, category, company, role, relationship, notes } = args as {
      name: string;
      email?: string;
      phone?: string;
      category: ContactCategory;
      company?: string;
      role?: string;
      relationship?: string;
      notes?: string;
    };

    const contact = addContact({
      name,
      email,
      phone,
      category: category || 'acquaintance',
      company,
      role,
      relationship,
      notes,
    });

    const details = [
      email && `📧 ${email}`,
      phone && `📱 ${phone}`,
      company && `🏢 ${company}`,
      role && `💼 ${role}`,
      relationship && `🔗 ${relationship}`,
    ].filter(Boolean).join('\n');

    return {
      success: true,
      result: `✓ Added ${name} to ${category} contacts!\n${details}`,
    };
  },

  async get_contact_history(args, context): Promise<ToolResult> {
    const { name } = args as { name: string };

    const result = findContactWithDisambiguation(name);

    // Check for disambiguation
    if (result.needsDisambiguation && result.message) {
      return { success: true, result: result.message };
    }

    if (result.matches.length === 0) {
      return { success: true, result: `No contact found for "${name}".` };
    }

    const contact = result.matches[0].contact;
    const history = getInteractionHistory(contact.id, 20);

    if (history.length === 0) {
      return {
        success: true,
        result: `**${contact.name}**\nNo recorded interactions yet. I'll start tracking as you communicate with them.`,
      };
    }

    const formatted = history.map(i => {
      const date = i.date.toLocaleDateString();
      const venue = i.venue ? ` @ ${i.venue}` : '';
      return `• ${date} (${i.type}): ${i.summary}${venue}`;
    }).join('\n');

    const venues = contact.frequentVenues?.length
      ? `\nUsually meet at: ${contact.frequentVenues.join(', ')}`
      : '';

    return {
      success: true,
      result: `**${contact.name}** - ${contact.interactionCount} interactions\nFirst contact: ${contact.firstInteraction?.toLocaleDateString() || 'Unknown'}\nLast contact: ${contact.lastInteraction?.toLocaleDateString() || 'Unknown'}${venues}\n\nHistory:\n${formatted}`,
    };
  },

  async add_contact_note(args, context): Promise<ToolResult> {
    const { name, note, venue, type = 'note' } = args as {
      name: string;
      note: string;
      venue?: string;
      type?: 'meeting' | 'call' | 'note';
    };

    const result = findContactWithDisambiguation(name);

    // Check for disambiguation
    if (result.needsDisambiguation && result.message) {
      return { success: true, result: result.message };
    }

    if (result.matches.length === 0) {
      return {
        success: false,
        error: `No contact found for "${name}". Save them first with save_contact.`,
      };
    }

    const contact = result.matches[0].contact;

    // Resolve venue if provided
    let resolvedVenue = venue;
    if (venue) {
      const venueResult = resolveVenue(venue);
      if (venueResult.resolved && venueResult.venue) {
        resolvedVenue = venueResult.venue.name;
      }
    }

    const interaction = addInteraction(contact.id, {
      type: type as any,
      summary: note,
      venue: resolvedVenue,
      agentId: context.agentId,
    });

    if (!interaction) {
      return { success: false, error: 'Failed to add interaction.' };
    }

    return {
      success: true,
      result: `Noted for ${contact.name}: "${note}"${resolvedVenue ? ` @ ${resolvedVenue}` : ''}`,
    };
  },

  // === Web Search ===
  async web_search(args, context): Promise<ToolResult> {
    const { query } = args as { query: string };

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Please provide a search query.' };
    }

    try {
      const response = await webSearch(query.trim());

      if (!response.success) {
        return { success: false, error: response.error || 'Search failed' };
      }

      if (response.results.length === 0 && !response.answer) {
        return { success: true, result: `No results found for "${query}".` };
      }

      return { success: true, result: formatSearchResults(response) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },

  // === Link Summarization ===
  async summarize_link(args, context): Promise<ToolResult> {
    const { url } = args as { url: string };

    if (!url || !url.trim()) {
      return { success: false, error: 'Please provide a URL to summarize.' };
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL. Please provide a valid link.' };
    }

    // Check if we have an LLM function for summarization
    if (!context.llmFn) {
      // Fallback: just fetch and return content preview
      const content = await fetchLinkContent(url);
      if (!content) {
        return { success: false, error: `Could not fetch content from ${url}. The site may be blocking access.` };
      }

      const preview = content.content.slice(0, 500) + (content.content.length > 500 ? '...' : '');
      const header = content.title ? `**${content.title}**\n` : '';
      const author = content.author ? `By: ${content.author}\n` : '';

      return {
        success: true,
        result: `${header}${author}Type: ${content.type}\n\nPreview:\n${preview}`,
      };
    }

    try {
      const result = await summarizeLink(url, context.llmFn);

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to summarize link' };
      }

      // Format the response
      const lines: string[] = [];

      if (result.title) {
        lines.push(`**${result.title}**`);
      }
      if (result.author) {
        lines.push(`By: ${result.author}`);
      }
      if (result.type) {
        lines.push(`Type: ${result.type}`);
      }
      lines.push('');
      lines.push(result.summary || 'No summary available.');

      return { success: true, result: lines.join('\n') };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to summarize' };
    }
  },

  // === Tool Forge (Self-Extension) ===
  async build_tool(args, context): Promise<ToolResult> {
    const { name, description, requirements } = args as {
      name: string;
      description: string;
      requirements: string;
    };

    if (!context.toolForge) {
      return { success: false, error: 'Tool Forge is not available.' };
    }

    // Validate tool name
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
      return {
        success: false,
        error: 'Tool name must be snake_case (e.g., notion_search, github_issues)',
      };
    }

    const MAX_RETRIES = 2;

    try {
      let result = await context.toolForge.buildTool({
        userId: context.userId,
        name,
        description,
        requirements,
        agentId: context.agentId,
      });

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to build tool' };
      }

      let tool = result.tool;

      // Test and retry loop
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const testResults = await context.toolForge.testTool(tool);
        const allPassed = testResults.every(t => t.passed);

        if (allPassed) {
          // Activate the tool
          await context.toolForge.activateTool(context.userId, name);

          return {
            success: true,
            result: `✅ Tool \`${name}\` built and activated!\n\nYou can now use it in our conversations.`,
          };
        }

        // Tests failed - try to improve if we have retries left
        if (attempt < MAX_RETRIES) {
          const improveResult = await context.toolForge.improveTool(tool, testResults);
          if (improveResult.success && improveResult.tool) {
            tool = improveResult.tool;
            continue; // Retry with improved tool
          }
        }

        // Final attempt failed
        const failures = testResults.filter(t => !t.passed);
        return {
          success: false,
          error: `Tool built but tests failed after ${attempt + 1} attempt(s):\n${failures.map(f => `- ${f.output}`).join('\n')}\n\nThe tool is saved but not activated. Try building again with more specific requirements.`,
        };
      }

      return { success: false, error: 'Tool build failed unexpectedly' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool build failed',
      };
    }
  },

  async list_custom_tools(args, context): Promise<ToolResult> {
    if (!context.toolForge) {
      return { success: false, error: 'Tool Forge is not available.' };
    }

    const tools = context.toolForge.getUserTools(context.userId);

    if (tools.length === 0) {
      return {
        success: true,
        result: 'You don\'t have any custom tools yet. Ask me to build one when you need functionality I don\'t have!',
      };
    }

    const lines = ['**Your Custom Tools:**', ''];
    for (const tool of tools) {
      const status = tool.status === 'active' ? '✅' : tool.status === 'disabled' ? '⏸️' : '🔨';
      const scope = tool.scope === 'global' ? ' [Global]' : tool.scope === 'submitted' ? ' [Pending Review]' : '';
      lines.push(`${status} \`${tool.name}\`${scope}`);
      lines.push(`   ${tool.description}`);
      lines.push('');
    }

    return { success: true, result: lines.join('\n') };
  },

  async disable_custom_tool(args, context): Promise<ToolResult> {
    const { toolName } = args as { toolName: string };

    if (!context.toolForge) {
      return { success: false, error: 'Tool Forge is not available.' };
    }

    const tool = context.toolForge.getUserTool(context.userId, toolName);
    if (!tool) {
      return { success: false, error: `Tool "${toolName}" not found.` };
    }

    const disabled = await context.toolForge.disableTool(context.userId, toolName);
    if (disabled) {
      return {
        success: true,
        result: `Tool \`${toolName}\` has been disabled. You can re-enable it later.`,
      };
    } else {
      return { success: false, error: 'Failed to disable tool.' };
    }
  },

  async submit_tool_for_review(args, context): Promise<ToolResult> {
    const { toolName } = args as { toolName: string };

    if (!context.toolForge) {
      return { success: false, error: 'Tool Forge is not available.' };
    }

    const tool = context.toolForge.getUserTool(context.userId, toolName);
    if (!tool) {
      return { success: false, error: `Tool "${toolName}" not found.` };
    }

    if (tool.status !== 'active') {
      return { success: false, error: 'Only active tools can be submitted. Activate the tool first.' };
    }

    const submitted = await context.toolForge.submitTool(context.userId, toolName);
    if (submitted) {
      return {
        success: true,
        result: `Tool \`${toolName}\` submitted for review! You'll be notified when it's approved for global use.`,
      };
    } else {
      return { success: false, error: 'Failed to submit tool.' };
    }
  },

  // === WhatsApp Contacts ===
  async get_whatsapp_contacts(args, context): Promise<ToolResult> {
    if (!context.whatsappAdapter) {
      return { success: false, error: 'WhatsApp not configured.' };
    }

    const allowlist = context.whatsappAllowlist;
    if (!allowlist || allowlist.length === 0) {
      return { success: true, result: 'No WhatsApp contacts configured. Ask user to add numbers to the allowlist.' };
    }

    // Try to match allowlist numbers to saved contacts
    const contacts = getContacts();
    const lines: string[] = ['WhatsApp-allowed contacts:'];

    for (const number of allowlist) {
      const contact = contacts.find(c => c.phone && normalizePhone(c.phone) === normalizePhone(number));
      if (contact) {
        lines.push(`• ${contact.name}: ${number}`);
      } else {
        lines.push(`• ${number} (no saved contact)`);
      }
    }

    return { success: true, result: lines.join('\n') };
  },

  // === Reminders ===
  async create_reminder(args, context): Promise<ToolResult> {
    const { content, time } = args as { content: string; time: string };

    if (!context.reminderEngine) {
      return { success: false, error: 'Reminder system not available.' };
    }

    try {
      const result = context.reminderEngine.createReminder(
        context.userId,
        content,
        time,
        context.agentId
      );

      const formattedTime = result.reminder.dueAt.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      return {
        success: true,
        result: `✓ Reminder set: "${content}" at ${formattedTime}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create reminder' };
    }
  },

  async list_reminders(args, context): Promise<ToolResult> {
    if (!context.reminderEngine) {
      return { success: false, error: 'Reminder system not available.' };
    }

    const reminders = context.reminderEngine.getReminders(context.userId);

    if (reminders.length === 0) {
      return { success: true, result: 'No pending reminders.' };
    }

    const lines = reminders.map(r => {
      const time = new Date(r.dueAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `• ${r.content} — ${time}`;
    });

    return { success: true, result: `Pending reminders:\n${lines.join('\n')}` };
  },

  async cancel_reminder(args, context): Promise<ToolResult> {
    const { search } = args as { search: string };

    if (!context.reminderEngine) {
      return { success: false, error: 'Reminder system not available.' };
    }

    const cancelled = context.reminderEngine.cancelReminderByContent(context.userId, search);

    if (cancelled) {
      return { success: true, result: `✓ Cancelled reminder: "${cancelled.content}"` };
    } else {
      return { success: false, error: `No pending reminder found matching "${search}"` };
    }
  },
};

// Helper to normalize phone numbers for comparison
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
}

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

// Helper: Parse datetime strings (more flexible)
function parseDateTime(dateTimeStr: string, timezone?: string): Date {
  const lower = dateTimeStr.toLowerCase();
  const now = new Date();

  // Handle "tomorrow 3pm", "today at 2:30pm", etc.
  const tomorrowMatch = lower.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (tomorrowMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    let hour = parseInt(tomorrowMatch[1]);
    const minute = tomorrowMatch[2] ? parseInt(tomorrowMatch[2]) : 0;
    const ampm = tomorrowMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  const todayMatch = lower.match(/today\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (todayMatch) {
    const d = new Date(now);
    let hour = parseInt(todayMatch[1]);
    const minute = todayMatch[2] ? parseInt(todayMatch[2]) : 0;
    const ampm = todayMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  // Try ISO format
  const parsed = new Date(dateTimeStr);
  if (!isNaN(parsed.getTime())) return parsed;

  // Fallback: use current time + 1 hour
  const fallback = new Date(now);
  fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
  return fallback;
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
export function formatToolsForPrompt(userInfo?: {
  name?: string;
  email?: string;
  whatsappAllowlist?: string[];
}): string {
  const userLines: string[] = [];
  if (userInfo?.name) userLines.push(`Name: ${userInfo.name}`);
  if (userInfo?.email) userLines.push(`Email: ${userInfo.email}`);
  if (userInfo?.whatsappAllowlist?.length) {
    userLines.push(`WhatsApp contacts: ${userInfo.whatsappAllowlist.join(', ')}`);
  }

  const userSection = userLines.length > 0
    ? `## User Info\n${userLines.join('\n')}\n\n`
    : '';

  return `## Available Tools
You can use these tools by responding with JSON tool calls. Format:
\`\`\`tool
{"name": "tool_name", "arguments": {...}}
\`\`\`

${userSection}Tools:
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}
  Parameters: ${Object.entries(t.parameters.properties).map(([k, v]) => `${k} (${v.type}): ${v.description}`).join(', ')}`).join('\n\n')}

## Capabilities
- **Web Search**: You have real-time web search BUILT IN. When asked about current events, weather, news, properties, prices, or ANY current information - just answer directly. The system automatically searches the web.
- **DO NOT use the web_search tool** - it's deprecated. Just answer search questions directly with your built-in web access.

## CRITICAL Rules:
1. **YOU MUST USE TOOL CALLS** - When user asks to create events, send emails, etc., you MUST output a tool call block. Do NOT just say you did it.
2. Tool call format (MUST follow exactly):
   \`\`\`tool
   {"name": "google_create_event", "arguments": {"title": "Meeting", "startTime": "2026-02-23T09:00:00", "duration": 60}}
   \`\`\`
3. The system asks user for confirmation before executing. Just call the tool.
4. **NEVER say "I've created" or "Done" without outputting a tool call block first**
5. For emails: Signature is auto-added. Don't include one in the body.
6. For calendar invites: Use ISO 8601 format for times (e.g., 2026-02-23T15:00:00).

## MULTIPLE ACTIONS - IMPORTANT
When the user asks for multiple things at once, output MULTIPLE tool calls in sequence:

Example: "Email John, remind me at 5pm to call mom, and check my meetings tomorrow"
\`\`\`tool
{"name": "send_email", "arguments": {"to": "john@example.com", "subject": "...", "body": "..."}}
\`\`\`
\`\`\`tool
{"name": "create_reminder", "arguments": {"content": "Call mom", "time": "5pm today"}}
\`\`\`
\`\`\`tool
{"name": "google_get_events", "arguments": {"date": "tomorrow"}}
\`\`\`

Always handle ALL requests in a single response. Don't ask which one to do first - do them all.

## YOUTUBE VIDEOS
For YouTube links, use the \`summarize_link\` tool - it extracts the FULL TRANSCRIPT and creates a real summary.
Do NOT use web search for YouTube - use the summarize_link tool!

**CORRECT:**
User: "Summarize this YouTube video: https://youtube.com/..."
Agent: *uses summarize_link tool*

## MISSING CAPABILITIES
**ONLY USE TOOLS LISTED ABOVE.** Do NOT invent or call tools that don't exist in the list!

**CRITICAL: When outputting a tool call, do NOT include fake results after it!**
- Output ONLY the tool call block
- Wait for the actual result
- NEVER write fake output before the tool returns`;
}

/**
 * Parse tool calls from LLM response
 */
export function parseToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Look for ```tool or ```json blocks containing tool calls
  const codeBlockRegex = /```(?:tool|json)\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.arguments) {
        toolCalls.push(parsed as ToolCall);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Also check for standalone JSON objects with name/arguments structure
  // This handles cases where the model outputs JSON without code blocks
  if (toolCalls.length === 0) {
    const jsonObjectRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    while ((match = jsonObjectRegex.exec(response)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        toolCalls.push({
          name: match[1],
          arguments: args,
        });
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  return toolCalls;
}

/**
 * Remove tool call blocks from response (for display to user)
 */
export function removeToolCallsFromResponse(response: string): string {
  // Find the first tool call block
  const toolCallMatch = response.match(/```tool\s*\n?[\s\S]*?```/);

  if (toolCallMatch && toolCallMatch.index !== undefined) {
    // Keep only the text BEFORE the first tool call
    // Everything after the tool call is likely hallucinated results
    const beforeToolCall = response.substring(0, toolCallMatch.index).trim();
    return beforeToolCall;
  }

  // No tool call blocks found - check for inline JSON tool calls
  const jsonToolMatch = response.match(/\{"name":\s*"\w+",\s*"arguments":\s*\{/);
  if (jsonToolMatch && jsonToolMatch.index !== undefined) {
    const beforeJson = response.substring(0, jsonToolMatch.index).trim();
    return beforeJson;
  }

  return response.trim();
}

/**
 * Categorize tools for dependency ordering
 * - Query tools (read-only) should execute first
 * - Action tools (write) execute after queries
 */
const QUERY_TOOLS = new Set([
  'google_get_events',
  'google_search_events',
  'google_find_free_time',
  'gmail_get_recent',
  'gmail_search',
  'gmail_read',
  'gmail_unread_count',
  'gmail_summarize',
  'gmail_find_replies',
  'tasks_get_pending',
  'list_reminders',
  'search_contacts',
  'get_contact',
  'list_contacts',
  'list_venues',
  'web_search',
]);

const ACTION_TOOLS = new Set([
  'send_email',
  'send_whatsapp',
  'google_create_event',
  'google_update_event',
  'gmail_send',
  'tasks_create',
  'create_reminder',
  'cancel_reminder',
  'add_contact',
  'add_venue',
  'log_interaction',
]);

/**
 * Order tool calls for optimal execution
 * 1. Query tools first (can run in parallel)
 * 2. Action tools second (may depend on query results)
 */
export function orderToolCalls(toolCalls: ToolCall[]): {
  queries: ToolCall[];
  actions: ToolCall[];
  other: ToolCall[];
} {
  const queries: ToolCall[] = [];
  const actions: ToolCall[] = [];
  const other: ToolCall[] = [];

  for (const tc of toolCalls) {
    if (QUERY_TOOLS.has(tc.name)) {
      queries.push(tc);
    } else if (ACTION_TOOLS.has(tc.name)) {
      actions.push(tc);
    } else {
      other.push(tc);
    }
  }

  return { queries, actions, other };
}

/**
 * Check if any action tools might depend on query tool results
 * This is a heuristic - we assume email/whatsapp with dynamic content
 * might reference calendar/task data
 */
export function hasLikelyDependencies(toolCalls: ToolCall[]): boolean {
  const { queries, actions } = orderToolCalls(toolCalls);

  if (queries.length === 0 || actions.length === 0) {
    return false;
  }

  // If there are both query and action tools, there might be dependencies
  // Check for common patterns:
  // - Calendar query + email (sending schedule)
  // - Task query + email (sending task list)
  const hasCalendarQuery = queries.some(q =>
    q.name.startsWith('google_') || q.name.includes('event')
  );
  const hasTaskQuery = queries.some(q =>
    q.name.includes('task') || q.name.includes('reminder')
  );
  const hasEmailAction = actions.some(a =>
    a.name.includes('email') || a.name === 'send_whatsapp'
  );

  return (hasCalendarQuery || hasTaskQuery) && hasEmailAction;
}
