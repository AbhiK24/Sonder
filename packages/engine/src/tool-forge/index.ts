/**
 * Tool Forge
 *
 * Self-extending tool system for Sonder.
 * Allows agents to build new tools on-the-fly based on user requests.
 *
 * Features:
 * - Dynamic tool registry (builtin + user + global)
 * - AI-powered tool building via LLM
 * - Per-user tool scoping with global submission option
 * - Rate limiting and security controls
 */

import type { LLMProvider } from '../types/index.js';
import type { ToolDefinition, ToolExecutor, ToolContext, ToolResult } from '../tools/index.js';
import type {
  UserTool,
  ToolForgeConfig,
  ToolBuildRequest,
  ToolBuildResult,
  TestResult,
} from './types.js';
import { ToolStorage, createToolStorage } from './storage.js';
import { DynamicToolRegistry, createDynamicRegistry } from './registry.js';
import { ToolBuilder, createToolBuilder } from './builder.js';

// Re-export types
export * from './types.js';
export { ToolStorage } from './storage.js';
export { DynamicToolRegistry } from './registry.js';
export { ToolBuilder } from './builder.js';

// =============================================================================
// Default Config
// =============================================================================

const DEFAULT_CONFIG: Partial<ToolForgeConfig> = {
  maxToolsPerUser: 10,
  maxBuildsPerDay: 3,
  maxToolCodeLength: 50000,
};

// =============================================================================
// Tool Forge
// =============================================================================

export class ToolForge {
  private storage: ToolStorage;
  private registry: DynamicToolRegistry;
  private builder: ToolBuilder;
  private config: ToolForgeConfig;
  private provider: LLMProvider;

  // Rate limiting
  private buildCounts: Map<string, { count: number; date: string }> = new Map();

  constructor(
    provider: LLMProvider,
    builtinTools: ToolDefinition[],
    builtinExecutors: Record<string, ToolExecutor>,
    config: Partial<ToolForgeConfig> & { storageDir: string }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config } as ToolForgeConfig;
    this.provider = provider;

    // Initialize components
    this.storage = createToolStorage(config.storageDir);
    this.registry = createDynamicRegistry(builtinTools, builtinExecutors, this.storage);
    this.builder = createToolBuilder(provider, this.storage);

    console.log(`[ToolForge] Initialized with storage at ${config.storageDir}`);
  }

  // ---------------------------------------------------------------------------
  // Tool Building
  // ---------------------------------------------------------------------------

  /**
   * Build a new tool from user requirements
   */
  async buildTool(request: ToolBuildRequest): Promise<ToolBuildResult> {
    // Check rate limit
    if (!this.checkBuildRateLimit(request.userId)) {
      return {
        success: false,
        error: `Daily build limit reached (${this.config.maxBuildsPerDay}/day). Try again tomorrow.`,
      };
    }

    // Check tool count limit
    const existingTools = this.registry.getAllUserTools(request.userId);
    if (existingTools.length >= this.config.maxToolsPerUser) {
      return {
        success: false,
        error: `Maximum tool limit reached (${this.config.maxToolsPerUser}). Disable or remove some tools first.`,
      };
    }

    // Check if tool name already exists
    if (this.registry.hasToolFor(request.userId, request.name)) {
      return {
        success: false,
        error: `A tool named "${request.name}" already exists.`,
      };
    }

    // Build the tool
    const result = await this.builder.buildTool(request);

    if (result.success && result.tool) {
      // Increment build count
      this.incrementBuildCount(request.userId);

      // Callback
      if (this.config.onToolBuilt) {
        await this.config.onToolBuilt(result.tool);
      }
    }

    return result;
  }

  /**
   * Test a tool
   */
  async testTool(tool: UserTool, testInputs?: Record<string, unknown>[]): Promise<TestResult[]> {
    return this.builder.testTool(tool, testInputs);
  }

  /**
   * Improve a tool based on test failures
   */
  async improveTool(tool: UserTool, testResults: TestResult[]): Promise<ToolBuildResult> {
    return this.builder.improveTool(tool, testResults);
  }

  /**
   * Activate a tool (make it usable)
   */
  async activateTool(userId: string, toolName: string): Promise<boolean> {
    const tool = this.registry.getUserTool(userId, toolName);
    if (!tool) return false;

    const updated = this.registry.updateUserTool(userId, toolName, {
      status: 'active',
    });

    if (updated && this.config.onToolActivated) {
      await this.config.onToolActivated(updated);
    }

    return updated !== undefined;
  }

  /**
   * Disable a tool
   */
  async disableTool(userId: string, toolName: string): Promise<boolean> {
    const updated = this.registry.updateUserTool(userId, toolName, {
      status: 'disabled',
    });
    return updated !== undefined;
  }

  /**
   * Submit a tool for global availability
   */
  async submitTool(userId: string, toolName: string): Promise<boolean> {
    const tool = this.registry.getUserTool(userId, toolName);
    if (!tool || tool.status !== 'active') {
      return false;
    }

    const updated = this.registry.updateUserTool(userId, toolName, {
      scope: 'submitted',
      submittedAt: new Date(),
    });

    if (updated && this.config.onToolSubmitted) {
      await this.config.onToolSubmitted(updated);
    }

    return updated !== undefined;
  }

  /**
   * Approve a submitted tool (admin action)
   */
  approveSubmittedTool(userId: string, toolName: string, approvedBy?: string): boolean {
    const tool = this.registry.getUserTool(userId, toolName);
    if (!tool || tool.scope !== 'submitted') {
      return false;
    }

    this.registry.promoteToGlobal(tool, approvedBy);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Registry Access
  // ---------------------------------------------------------------------------

  /**
   * Get all tools for a user (builtin + user + global)
   */
  getToolsForUser(userId: string): ToolDefinition[] {
    return this.registry.getToolsForUser(userId);
  }

  /**
   * Get executor for a tool
   */
  getExecutor(toolName: string, userId: string): ToolExecutor | undefined {
    return this.registry.getExecutor(toolName, userId);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const executor = this.getExecutor(toolName, context.userId);
    if (!executor) {
      return { success: false, error: `Tool not found: ${toolName}` };
    }

    return executor(args, context);
  }

  /**
   * Get all user tools
   */
  getUserTools(userId: string): UserTool[] {
    return this.registry.getAllUserTools(userId);
  }

  /**
   * Get a specific user tool
   */
  getUserTool(userId: string, toolName: string): UserTool | undefined {
    return this.registry.getUserTool(userId, toolName);
  }

  /**
   * Load user tools from storage
   */
  loadUserTools(userId: string): void {
    this.registry.loadUserTools(userId);
  }

  /**
   * Check if a tool exists
   */
  hasTool(userId: string, toolName: string): boolean {
    return this.registry.hasToolFor(userId, toolName);
  }

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------

  private checkBuildRateLimit(userId: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    const userLimit = this.buildCounts.get(userId);

    if (!userLimit || userLimit.date !== today) {
      return true; // New day or first build
    }

    return userLimit.count < this.config.maxBuildsPerDay;
  }

  private incrementBuildCount(userId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const userLimit = this.buildCounts.get(userId);

    if (!userLimit || userLimit.date !== today) {
      this.buildCounts.set(userId, { count: 1, date: today });
    } else {
      userLimit.count++;
    }
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats() {
    return {
      ...this.registry.getStats(),
      ...this.storage.getStorageStats(),
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createToolForge(
  provider: LLMProvider,
  builtinTools: ToolDefinition[],
  builtinExecutors: Record<string, ToolExecutor>,
  config: Partial<ToolForgeConfig> & { storageDir: string }
): ToolForge {
  return new ToolForge(provider, builtinTools, builtinExecutors, config);
}
