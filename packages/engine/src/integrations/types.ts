/**
 * Integration Types
 *
 * Base types for all external service integrations.
 * Safety principle: CREATE, READ, SEND — Never DELETE.
 */

// =============================================================================
// Base Integration Types
// =============================================================================

export type IntegrationType =
  | 'google_calendar'
  | 'apple_calendar'
  | 'todoist'
  | 'notion'
  | 'gmail'
  | 'resend'
  | 'mailgun'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'spotify'
  | 'rss';

export type IntegrationStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface IntegrationCredentials {
  type: IntegrationType;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IntegrationConfig {
  type: IntegrationType;
  enabled: boolean;
  credentials?: IntegrationCredentials;
  settings?: Record<string, unknown>;
}

export interface IntegrationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rateLimited?: boolean;
}

// =============================================================================
// Base Integration Adapter
// =============================================================================

export interface BaseIntegrationAdapter {
  type: IntegrationType;
  status: IntegrationStatus;

  // Lifecycle
  connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Health
  healthCheck(): Promise<IntegrationResult<void>>;
}

// =============================================================================
// Calendar Types
// =============================================================================

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
  reminders?: CalendarReminder[];
}

export interface CalendarReminder {
  method: 'email' | 'popup' | 'sms';
  minutesBefore: number;
}

export interface CalendarAdapter extends BaseIntegrationAdapter {
  type: 'google_calendar' | 'apple_calendar';

  // Read
  getEvents(startDate: Date, endDate: Date): Promise<IntegrationResult<CalendarEvent[]>>;
  getUpcoming(hours: number): Promise<IntegrationResult<CalendarEvent[]>>;

  // Create (never delete)
  createEvent(event: CalendarEvent): Promise<IntegrationResult<CalendarEvent>>;

  // Update (careful)
  updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<IntegrationResult<CalendarEvent>>;
}

// =============================================================================
// Task Types
// =============================================================================

export interface Task {
  id?: string;
  content: string;
  description?: string;
  dueDate?: Date;
  priority?: 1 | 2 | 3 | 4;  // 1 = highest
  labels?: string[];
  projectId?: string;
  completed?: boolean;
  createdAt?: Date;
}

export interface TaskProject {
  id: string;
  name: string;
  color?: string;
}

export interface TaskAdapter extends BaseIntegrationAdapter {
  type: 'todoist' | 'notion';

  // Read
  getTasks(filter?: { projectId?: string; dueDate?: Date }): Promise<IntegrationResult<Task[]>>;
  getProjects(): Promise<IntegrationResult<TaskProject[]>>;

  // Create (never delete)
  createTask(task: Task): Promise<IntegrationResult<Task>>;

  // Update
  completeTask(taskId: string): Promise<IntegrationResult<void>>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<IntegrationResult<Task>>;
}

// =============================================================================
// Email Types
// =============================================================================

export interface EmailMessage {
  id?: string;
  from?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  threadId?: string;
  receivedAt?: Date;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  data?: Buffer;
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;  // First ~100 chars
  receivedAt: Date;
  isUnread: boolean;
  labels?: string[];
}

export interface EmailFilter {
  maxResults?: number;
  query?: string;  // Gmail search query
  labelIds?: string[];
  unreadOnly?: boolean;
  after?: Date;
}

export interface EmailAdapter extends BaseIntegrationAdapter {
  type: 'gmail' | 'resend';

  // Read (subjects/snippets only by default for privacy) - Gmail only
  getMessages?(filter: EmailFilter): Promise<IntegrationResult<EmailSummary[]>>;
  getMessage?(messageId: string): Promise<IntegrationResult<EmailMessage>>;

  // Create draft (safe) - Gmail only
  createDraft?(email: EmailMessage): Promise<IntegrationResult<{ draftId: string }>>;

  // Send (requires confirmation)
  sendEmail(email: EmailMessage, confirmed: boolean): Promise<IntegrationResult<{ messageId: string }>>;
  sendDraft?(draftId: string, confirmed: boolean): Promise<IntegrationResult<{ messageId: string }>>;
}

/**
 * Simple send-only email adapter (for Resend, Postmark, etc.)
 * Much simpler setup - just an API key, no OAuth
 */
export interface SimpleEmailAdapter extends BaseIntegrationAdapter {
  type: 'resend';

  // Send only - no inbox access
  sendEmail(email: EmailMessage, confirmed: boolean): Promise<IntegrationResult<{ messageId: string }>>;
}

/**
 * Inbound email adapter (for Mailgun, etc.)
 * Receives and stores emails that can be queried
 */
export interface InboundEmailAdapter extends BaseIntegrationAdapter {
  type: 'mailgun';

  // Query inbox
  getMessages(filter?: EmailFilter): Promise<IntegrationResult<EmailSummary[]>>;
  getMessage(messageId: string): Promise<IntegrationResult<EmailMessage>>;

  // Get unread count
  getUnreadCount(): Promise<IntegrationResult<number>>;

  // Mark as read
  markAsRead(messageId: string): Promise<IntegrationResult<void>>;
}

// =============================================================================
// Content/RSS Types
// =============================================================================

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'atom' | 'json';
  category?: string;
  lastFetched?: Date;
  fetchFrequency?: 'hourly' | 'daily' | 'weekly';
}

export interface FeedItem {
  id: string;
  sourceId: string;
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  author?: string;
  publishedAt?: Date;
  categories?: string[];
  imageUrl?: string;
}

export interface ContentAdapter extends BaseIntegrationAdapter {
  type: 'rss';

  // Sources
  addSource(source: Omit<FeedSource, 'id'>): Promise<IntegrationResult<FeedSource>>;
  getSources(): Promise<IntegrationResult<FeedSource[]>>;
  removeSource(sourceId: string): Promise<IntegrationResult<void>>;

  // Fetch
  fetchSource(sourceId: string): Promise<IntegrationResult<FeedItem[]>>;
  fetchAll(): Promise<IntegrationResult<FeedItem[]>>;

  // Read
  getItems(filter?: { sourceId?: string; since?: Date; limit?: number }): Promise<IntegrationResult<FeedItem[]>>;
}

// =============================================================================
// Messaging Types (for WhatsApp, Slack, etc.)
// =============================================================================

export interface OutgoingMessage {
  to: string;  // Phone number, channel ID, etc.
  content: string;
  mediaUrl?: string;
}

export interface MessagingAdapter extends BaseIntegrationAdapter {
  type: 'whatsapp' | 'telegram' | 'slack';

  // Send (may require confirmation for certain recipients)
  sendMessage(message: OutgoingMessage, confirmed: boolean): Promise<IntegrationResult<{ messageId: string }>>;
}

// =============================================================================
// Integration Manager Types
// =============================================================================

export interface IntegrationManager {
  // Registration
  register(adapter: BaseIntegrationAdapter): void;

  // Access
  get<T extends BaseIntegrationAdapter>(type: IntegrationType): T | undefined;
  getAll(): BaseIntegrationAdapter[];

  // Status
  getStatus(): Record<IntegrationType, IntegrationStatus>;

  // Lifecycle
  connectAll(configs: IntegrationConfig[]): Promise<void>;
  disconnectAll(): Promise<void>;
}

// =============================================================================
// Action Log (Transparency)
// =============================================================================

export interface IntegrationAction {
  id: string;
  timestamp: Date;
  integration: IntegrationType;
  action: string;  // 'create_event', 'send_email', etc.
  details: Record<string, unknown>;
  success: boolean;
  error?: string;
  userConfirmed?: boolean;
}

export interface ActionLogger {
  log(action: Omit<IntegrationAction, 'id' | 'timestamp'>): void;
  getRecent(limit?: number): IntegrationAction[];
  getByIntegration(type: IntegrationType, limit?: number): IntegrationAction[];
}
