/**
 * Dynamic Tool Registry
 *
 * Manages built-in tools + user-created tools + global community tools.
 * Provides unified interface for getting tools and executors.
 */

import type { ToolDefinition, ToolResult, ToolExecutor, ToolContext } from '../tools/index.js';
import type { UserTool } from './types.js';
import { ToolStorage } from './storage.js';

// =============================================================================
// Dynamic Tool Registry
// =============================================================================

export class DynamicToolRegistry {
  private builtinTools: ToolDefinition[];
  private builtinExecutors: Record<string, ToolExecutor>;
  private userTools: Map<string, UserTool[]> = new Map();
  private globalTools: UserTool[] = [];
  private storage: ToolStorage;

  constructor(
    builtinTools: ToolDefinition[],
    builtinExecutors: Record<string, ToolExecutor>,
    storage: ToolStorage
  ) {
    this.builtinTools = builtinTools;
    this.builtinExecutors = builtinExecutors;
    this.storage = storage;

    // Load global tools
    this.globalTools = storage.loadGlobalTools();
    console.log(`[ToolRegistry] Loaded ${this.globalTools.length} global tools`);
  }

  // ---------------------------------------------------------------------------
  // Tool Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Get all tool definitions for a user (builtin + user + global)
   */
  getToolsForUser(userId: string): ToolDefinition[] {
    const userToolDefs = this.getUserToolDefinitions(userId);
    const globalToolDefs = this.globalTools
      .filter(t => t.status === 'active')
      .map(t => this.toDefinition(t));

    return [
      ...this.builtinTools,
      ...globalToolDefs,
      ...userToolDefs,
    ];
  }

  /**
   * Get only user-created tool definitions
   */
  getUserToolDefinitions(userId: string): ToolDefinition[] {
    const userTools = this.userTools.get(userId) || [];
    return userTools
      .filter(t => t.status === 'active')
      .map(t => this.toDefinition(t));
  }

  /**
   * Get executor for a tool by name
   */
  getExecutor(toolName: string, userId: string): ToolExecutor | undefined {
    // 1. Check builtin first (highest priority)
    if (this.builtinExecutors[toolName]) {
      return this.builtinExecutors[toolName];
    }

    // 2. Check user tools
    const userTool = this.getUserTool(userId, toolName);
    if (userTool && userTool.status === 'active') {
      return this.createExecutor(userTool);
    }

    // 3. Check global tools
    const globalTool = this.globalTools.find(t => t.name === toolName && t.status === 'active');
    if (globalTool) {
      return this.createExecutor(globalTool);
    }

    return undefined;
  }

  /**
   * Check if a tool exists (any scope)
   */
  hasToolFor(userId: string, toolName: string): boolean {
    return (
      this.builtinExecutors[toolName] !== undefined ||
      this.getUserTool(userId, toolName) !== undefined ||
      this.globalTools.some(t => t.name === toolName && t.status === 'active')
    );
  }

  // ---------------------------------------------------------------------------
  // User Tool Management
  // ---------------------------------------------------------------------------

  /**
   * Load user tools from storage
   */
  loadUserTools(userId: string): void {
    const registry = this.storage.loadUserRegistry(userId);
    this.userTools.set(userId, registry.tools);
    console.log(`[ToolRegistry] Loaded ${registry.tools.length} tools for user ${userId}`);
  }

  /**
   * Get a specific user tool
   */
  getUserTool(userId: string, toolName: string): UserTool | undefined {
    return this.userTools.get(userId)?.find(t => t.name === toolName);
  }

  /**
   * Get all user tools
   */
  getAllUserTools(userId: string): UserTool[] {
    return this.userTools.get(userId) || [];
  }

  /**
   * Register a new user tool
   */
  registerUserTool(userId: string, tool: UserTool): void {
    let tools = this.userTools.get(userId) || [];

    // Replace if exists, otherwise add
    const existing = tools.findIndex(t => t.name === tool.name);
    if (existing >= 0) {
      tools[existing] = tool;
    } else {
      tools.push(tool);
    }

    this.userTools.set(userId, tools);

    // Persist
    const registry = this.storage.loadUserRegistry(userId);
    registry.tools = tools;
    this.storage.saveUserRegistry(registry);

    console.log(`[ToolRegistry] Registered tool ${tool.name} for user ${userId}`);
  }

  /**
   * Update a user tool
   */
  updateUserTool(userId: string, toolName: string, updates: Partial<UserTool>): UserTool | undefined {
    const tool = this.getUserTool(userId, toolName);
    if (!tool) return undefined;

    const updated = {
      ...tool,
      ...updates,
      updatedAt: new Date(),
    };

    this.registerUserTool(userId, updated);
    return updated;
  }

  /**
   * Remove a user tool
   */
  removeUserTool(userId: string, toolName: string): boolean {
    const tools = this.userTools.get(userId) || [];
    const filtered = tools.filter(t => t.name !== toolName);

    if (filtered.length === tools.length) {
      return false; // Not found
    }

    this.userTools.set(userId, filtered);

    // Delete source file
    this.storage.deleteToolSource(userId, toolName);

    // Persist
    const registry = this.storage.loadUserRegistry(userId);
    registry.tools = filtered;
    this.storage.saveUserRegistry(registry);

    console.log(`[ToolRegistry] Removed tool ${toolName} for user ${userId}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Global Tool Management
  // ---------------------------------------------------------------------------

  /**
   * Promote a user tool to global
   */
  promoteToGlobal(tool: UserTool, approvedBy?: string): void {
    const globalTool: UserTool = {
      ...tool,
      scope: 'global',
      approvedAt: new Date(),
      approvedBy,
    };

    this.storage.promoteToGlobal(globalTool);
    this.globalTools = this.storage.loadGlobalTools();

    console.log(`[ToolRegistry] Promoted ${tool.name} to global`);
  }

  /**
   * Get all global tools
   */
  getGlobalTools(): UserTool[] {
    return this.globalTools;
  }

  // ---------------------------------------------------------------------------
  // Executor Creation
  // ---------------------------------------------------------------------------

  /**
   * Create an executor from user tool source code
   */
  private createExecutor(tool: UserTool): ToolExecutor {
    return async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
      try {
        // Load source code
        const source = tool.sourceCode || this.storage.loadToolSource(tool.userId, tool.name);
        if (!source) {
          return { success: false, error: `Tool source not found: ${tool.name}` };
        }

        // Execute in sandboxed context
        // For now, we use dynamic import with data URL
        // In production, this should use a proper sandbox (vm2, isolated-vm, etc.)
        const executor = await this.compileAndGetExecutor(source, tool.name);
        if (!executor) {
          return { success: false, error: `Failed to compile tool: ${tool.name}` };
        }

        return await executor(args, context);
      } catch (error) {
        console.error(`[ToolRegistry] Error executing ${tool.name}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
        };
      }
    };
  }

  /**
   * Compile TypeScript source and extract executor
   * Note: In production, use proper sandboxing!
   */
  private async compileAndGetExecutor(
    source: string,
    toolName: string
  ): Promise<ToolExecutor | null> {
    try {
      // Simple approach: Look for exported execute function
      // The source should export: export async function execute(args, context) { ... }

      // For safety, we wrap in a function and eval
      // TODO: Use proper TypeScript compilation and sandboxing
      const wrappedSource = `
        const module = { exports: {} };
        const exports = module.exports;
        ${source.replace(/export\s+/g, 'module.exports.')}
        return module.exports;
      `;

      const moduleExports = new Function(wrappedSource)();

      if (typeof moduleExports.execute === 'function') {
        return moduleExports.execute;
      }

      if (typeof moduleExports.default?.execute === 'function') {
        return moduleExports.default.execute;
      }

      console.error(`[ToolRegistry] No execute function found in ${toolName}`);
      return null;
    } catch (error) {
      console.error(`[ToolRegistry] Failed to compile ${toolName}:`, error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Conversion Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert UserTool to ToolDefinition
   */
  private toDefinition(tool: UserTool): ToolDefinition {
    return {
      name: tool.name,
      description: tool.description + (tool.scope === 'global' ? ' [Community]' : ' [Custom]'),
      parameters: tool.parameters,
    };
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats() {
    let totalUserTools = 0;
    Array.from(this.userTools.values()).forEach(tools => {
      totalUserTools += tools.length;
    });

    return {
      builtinTools: this.builtinTools.length,
      globalTools: this.globalTools.length,
      userTools: totalUserTools,
      usersWithTools: this.userTools.size,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createDynamicRegistry(
  builtinTools: ToolDefinition[],
  builtinExecutors: Record<string, ToolExecutor>,
  storage: ToolStorage
): DynamicToolRegistry {
  return new DynamicToolRegistry(builtinTools, builtinExecutors, storage);
}
