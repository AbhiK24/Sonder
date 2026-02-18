/**
 * Task Manager Integration (Todoist)
 *
 * Read tasks, create tasks, complete tasks.
 * Safety: Can create and complete, never delete.
 */

import {
  TaskAdapter,
  Task,
  TaskProject,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus
} from './types.js';

// =============================================================================
// Todoist Adapter
// =============================================================================

export class TodoistAdapter implements TaskAdapter {
  type = 'todoist' as const;
  status: IntegrationStatus = 'disconnected';

  private apiToken: string | null = null;

  private static readonly API_BASE = 'https://api.todoist.com/rest/v2';
  private static readonly SYNC_API = 'https://api.todoist.com/sync/v9';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    try {
      this.status = 'connecting';

      if (credentials.apiKey) {
        this.apiToken = credentials.apiKey;

        // Verify token works
        const check = await this.healthCheck();
        if (!check.success) {
          this.status = 'error';
          return check;
        }

        this.status = 'connected';
        return { success: true };
      }

      this.status = 'error';
      return {
        success: false,
        error: 'No API token provided. Get one from Todoist Settings > Integrations > API token'
      };
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async disconnect(): Promise<void> {
    this.apiToken = null;
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.apiToken !== null;
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    if (!this.apiToken) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(`${TodoistAdapter.API_BASE}/projects`, {
        headers: { Authorization: `Bearer ${this.apiToken}` }
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API token' };
      }

      if (response.status === 429) {
        return { success: false, error: 'Rate limited', rateLimited: true };
      }

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  async getTasks(filter?: { projectId?: string; dueDate?: Date }): Promise<IntegrationResult<Task[]>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      let url = `${TodoistAdapter.API_BASE}/tasks`;
      const params = new URLSearchParams();

      if (filter?.projectId) {
        params.set('project_id', filter.projectId);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiToken}` }
      });

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      let tasks = this.parseTasks(data);

      // Filter by due date if specified
      if (filter?.dueDate) {
        const targetDate = filter.dueDate.toISOString().split('T')[0];
        tasks = tasks.filter(t => {
          if (!t.dueDate) return false;
          return t.dueDate.toISOString().split('T')[0] === targetDate;
        });
      }

      return { success: true, data: tasks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tasks'
      };
    }
  }

  async getProjects(): Promise<IntegrationResult<TaskProject[]>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(`${TodoistAdapter.API_BASE}/projects`, {
        headers: { Authorization: `Bearer ${this.apiToken}` }
      });

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const projects: TaskProject[] = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        color: p.color,
      }));

      return { success: true, data: projects };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch projects'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Create Operations (Safe)
  // ---------------------------------------------------------------------------

  async createTask(task: Task): Promise<IntegrationResult<Task>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const todoistTask = this.toTodoistTask(task);

      const response = await fetch(`${TodoistAdapter.API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(todoistTask),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to create task: ${error}` };
      }

      const created = await response.json();
      const parsed = this.parseTask(created);

      return { success: true, data: parsed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Update Operations (Safe)
  // ---------------------------------------------------------------------------

  async completeTask(taskId: string): Promise<IntegrationResult<void>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await fetch(`${TodoistAdapter.API_BASE}/tasks/${taskId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken}` }
      });

      if (!response.ok) {
        return { success: false, error: `Failed to complete task: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete task'
      };
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<IntegrationResult<Task>> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const todoistUpdates: any = {};

      if (updates.content) todoistUpdates.content = updates.content;
      if (updates.description) todoistUpdates.description = updates.description;
      if (updates.dueDate) todoistUpdates.due_date = updates.dueDate.toISOString().split('T')[0];
      if (updates.priority) todoistUpdates.priority = updates.priority;
      if (updates.labels) todoistUpdates.labels = updates.labels;

      const response = await fetch(`${TodoistAdapter.API_BASE}/tasks/${taskId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(todoistUpdates),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to update task: ${error}` };
      }

      const updated = await response.json();
      return { success: true, data: this.parseTask(updated) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseTasks(items: any[]): Task[] {
    return items.map(item => this.parseTask(item));
  }

  private parseTask(item: any): Task {
    return {
      id: item.id,
      content: item.content,
      description: item.description,
      dueDate: item.due?.date ? new Date(item.due.date) : undefined,
      priority: item.priority as 1 | 2 | 3 | 4,
      labels: item.labels,
      projectId: item.project_id,
      completed: item.is_completed,
      createdAt: new Date(item.created_at),
    };
  }

  private toTodoistTask(task: Task): any {
    const todoistTask: any = {
      content: task.content,
    };

    if (task.description) todoistTask.description = task.description;
    if (task.dueDate) todoistTask.due_date = task.dueDate.toISOString().split('T')[0];
    if (task.priority) todoistTask.priority = task.priority;
    if (task.labels) todoistTask.labels = task.labels;
    if (task.projectId) todoistTask.project_id = task.projectId;

    return todoistTask;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createTaskAdapter(type: 'todoist' | 'notion'): TaskAdapter {
  switch (type) {
    case 'todoist':
      return new TodoistAdapter();
    case 'notion':
      throw new Error('Notion task adapter not yet implemented');
    default:
      throw new Error(`Unknown task adapter type: ${type}`);
  }
}
