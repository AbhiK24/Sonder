/**
 * Integration Hub
 *
 * Central manager for all integrations.
 * Handles registration, connection, and access.
 */

import {
  BaseIntegrationAdapter,
  IntegrationType,
  IntegrationStatus,
  IntegrationConfig,
  IntegrationAction,
  ActionLogger,
  CalendarAdapter,
  TaskAdapter,
  EmailAdapter,
  ContentAdapter,
} from './types.js';

import { createCalendarAdapter } from './calendar.js';
import { createTaskAdapter } from './tasks.js';
import { createEmailAdapter } from './email.js';
import { createContentAdapter } from './content.js';

// =============================================================================
// Action Logger Implementation
// =============================================================================

class SimpleActionLogger implements ActionLogger {
  private actions: IntegrationAction[] = [];
  private maxActions: number = 1000;

  log(action: Omit<IntegrationAction, 'id' | 'timestamp'>): void {
    const fullAction: IntegrationAction = {
      ...action,
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };

    this.actions.unshift(fullAction);

    // Keep bounded
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }

    // Log to console in dev
    const emoji = action.success ? '✅' : '❌';
    console.log(`[Integration] ${emoji} ${action.integration}.${action.action}`);
  }

  getRecent(limit: number = 50): IntegrationAction[] {
    return this.actions.slice(0, limit);
  }

  getByIntegration(type: IntegrationType, limit: number = 50): IntegrationAction[] {
    return this.actions
      .filter(a => a.integration === type)
      .slice(0, limit);
  }
}

// =============================================================================
// Integration Hub
// =============================================================================

export class IntegrationHub {
  private adapters: Map<IntegrationType, BaseIntegrationAdapter> = new Map();
  private logger: ActionLogger = new SimpleActionLogger();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register an adapter (usually done automatically via connect)
   */
  register(adapter: BaseIntegrationAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  /**
   * Connect a single integration
   */
  async connect(config: IntegrationConfig): Promise<boolean> {
    if (!config.enabled || !config.credentials) {
      return false;
    }

    try {
      let adapter = this.adapters.get(config.type);

      // Create adapter if not registered
      if (!adapter) {
        adapter = this.createAdapter(config.type);
        this.register(adapter);
      }

      const result = await adapter.connect(config.credentials);

      this.logger.log({
        integration: config.type,
        action: 'connect',
        details: { success: result.success },
        success: result.success,
        error: result.error,
      });

      return result.success;
    } catch (error) {
      this.logger.log({
        integration: config.type,
        action: 'connect',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      return false;
    }
  }

  /**
   * Connect multiple integrations
   */
  async connectAll(configs: IntegrationConfig[]): Promise<Record<IntegrationType, boolean>> {
    const results: Record<string, boolean> = {};

    for (const config of configs) {
      results[config.type] = await this.connect(config);
    }

    return results as Record<IntegrationType, boolean>;
  }

  /**
   * Disconnect all integrations
   */
  async disconnectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.disconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  /**
   * Get a specific adapter
   */
  get<T extends BaseIntegrationAdapter>(type: IntegrationType): T | undefined {
    return this.adapters.get(type) as T | undefined;
  }

  /**
   * Get calendar adapter
   */
  calendar(): CalendarAdapter | undefined {
    return this.get<CalendarAdapter>('google_calendar');
  }

  /**
   * Get task adapter
   */
  tasks(): TaskAdapter | undefined {
    return this.get<TaskAdapter>('todoist');
  }

  /**
   * Get email adapter
   */
  email(): EmailAdapter | undefined {
    return this.get<EmailAdapter>('gmail');
  }

  /**
   * Get content/RSS adapter
   */
  content(): ContentAdapter | undefined {
    return this.get<ContentAdapter>('rss');
  }

  /**
   * Get all registered adapters
   */
  getAll(): BaseIntegrationAdapter[] {
    return Array.from(this.adapters.values());
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /**
   * Get status of all integrations
   */
  getStatus(): Record<IntegrationType, IntegrationStatus> {
    const status: Record<string, IntegrationStatus> = {};

    for (const [type, adapter] of this.adapters) {
      status[type] = adapter.status;
    }

    return status as Record<IntegrationType, IntegrationStatus>;
  }

  /**
   * Check if a specific integration is connected
   */
  isConnected(type: IntegrationType): boolean {
    const adapter = this.adapters.get(type);
    return adapter?.isConnected() ?? false;
  }

  /**
   * Get action log
   */
  getActionLog(limit?: number): IntegrationAction[] {
    return this.logger.getRecent(limit);
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  private createAdapter(type: IntegrationType): BaseIntegrationAdapter {
    switch (type) {
      case 'google_calendar':
      case 'apple_calendar':
        return createCalendarAdapter(type);
      case 'todoist':
      case 'notion':
        return createTaskAdapter(type);
      case 'gmail':
        return createEmailAdapter(type);
      case 'rss':
        return createContentAdapter(type);
      default:
        throw new Error(`Unknown integration type: ${type}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Convenience Methods (with logging)
  // ---------------------------------------------------------------------------

  /**
   * Get upcoming calendar events
   */
  async getUpcomingEvents(hours: number = 24) {
    const cal = this.calendar();
    if (!cal?.isConnected()) {
      return { success: false, error: 'Calendar not connected' };
    }

    const result = await cal.getUpcoming(hours);

    this.logger.log({
      integration: 'google_calendar',
      action: 'getUpcoming',
      details: { hours, eventCount: result.data?.length || 0 },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(event: Parameters<CalendarAdapter['createEvent']>[0]) {
    const cal = this.calendar();
    if (!cal?.isConnected()) {
      return { success: false, error: 'Calendar not connected' };
    }

    const result = await cal.createEvent(event);

    this.logger.log({
      integration: 'google_calendar',
      action: 'createEvent',
      details: { title: event.title, startTime: event.startTime },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Get tasks
   */
  async getTasks(filter?: Parameters<TaskAdapter['getTasks']>[0]) {
    const tasks = this.tasks();
    if (!tasks?.isConnected()) {
      return { success: false, error: 'Task manager not connected' };
    }

    const result = await tasks.getTasks(filter);

    this.logger.log({
      integration: 'todoist',
      action: 'getTasks',
      details: { filter, taskCount: result.data?.length || 0 },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Create a task
   */
  async createTask(task: Parameters<TaskAdapter['createTask']>[0]) {
    const tasks = this.tasks();
    if (!tasks?.isConnected()) {
      return { success: false, error: 'Task manager not connected' };
    }

    const result = await tasks.createTask(task);

    this.logger.log({
      integration: 'todoist',
      action: 'createTask',
      details: { content: task.content, dueDate: task.dueDate },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Get recent emails
   */
  async getEmails(filter: Parameters<EmailAdapter['getMessages']>[0]) {
    const email = this.email();
    if (!email?.isConnected()) {
      return { success: false, error: 'Email not connected' };
    }

    const result = await email.getMessages(filter);

    this.logger.log({
      integration: 'gmail',
      action: 'getMessages',
      details: { filter, messageCount: result.data?.length || 0 },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Create email draft
   */
  async createEmailDraft(email: Parameters<EmailAdapter['createDraft']>[0]) {
    const emailAdapter = this.email();
    if (!emailAdapter?.isConnected()) {
      return { success: false, error: 'Email not connected' };
    }

    const result = await emailAdapter.createDraft(email);

    this.logger.log({
      integration: 'gmail',
      action: 'createDraft',
      details: { to: email.to, subject: email.subject },
      success: result.success,
      error: result.error,
    });

    return result;
  }

  /**
   * Fetch all RSS feeds
   */
  async fetchFeeds() {
    const content = this.content();
    if (!content?.isConnected()) {
      return { success: false, error: 'Content adapter not connected' };
    }

    const result = await content.fetchAll();

    this.logger.log({
      integration: 'rss',
      action: 'fetchAll',
      details: { itemCount: result.data?.length || 0 },
      success: result.success,
      error: result.error,
    });

    return result;
  }
}

// =============================================================================
// Singleton (optional, for convenience)
// =============================================================================

let _hub: IntegrationHub | null = null;

export function getIntegrationHub(): IntegrationHub {
  if (!_hub) {
    _hub = new IntegrationHub();
  }
  return _hub;
}
