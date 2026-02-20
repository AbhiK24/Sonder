/**
 * Tool Forge Types
 *
 * Interfaces for the self-extending tool system.
 */

import type { ToolDefinition, ToolResult } from '../tools/index.js';

// =============================================================================
// User Tool Definition
// =============================================================================

export type ToolStatus = 'draft' | 'testing' | 'active' | 'disabled';
export type ToolScope = 'private' | 'submitted' | 'global';

export interface UserTool {
  id: string;
  userId: string;
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];

  // Code
  sourceCode: string;        // TypeScript source
  compiledCode?: string;     // Compiled JS (if pre-compiled)

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;         // agentId who built it
  version: number;

  // Status
  status: ToolStatus;
  testResults?: TestResult[];

  // Scope
  scope: ToolScope;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;

  // Dependencies (optional)
  dependencies?: string[];   // npm packages needed
  apiKeys?: string[];        // env vars needed (e.g., 'NOTION_API_KEY')
}

export interface TestResult {
  passed: boolean;
  output: string;
  timestamp: Date;
  testCase?: string;
}

// =============================================================================
// Tool Build Request
// =============================================================================

export interface ToolBuildRequest {
  userId: string;
  name: string;
  description: string;
  requirements: string;
  agentId?: string;
}

export interface ToolBuildResult {
  success: boolean;
  tool?: UserTool;
  error?: string;
  logs?: string[];
}

// =============================================================================
// Tool Registry State
// =============================================================================

export interface UserToolRegistry {
  userId: string;
  tools: UserTool[];
  lastUpdated: Date;
  settings: {
    maxTools: number;
    dailyBuildLimit: number;
    buildsToday: number;
    lastBuildDate: string;  // ISO date string
  };
}

// =============================================================================
// Storage
// =============================================================================

export interface ToolStorageConfig {
  baseDir: string;          // e.g., ~/.sonder/tools
  globalDir?: string;       // e.g., ~/.sonder/tools/global
  usersDir?: string;        // e.g., ~/.sonder/tools/users
}

// =============================================================================
// Tool Forge Config
// =============================================================================

export interface ToolForgeConfig {
  storageDir: string;

  // Limits
  maxToolsPerUser: number;      // Default: 10
  maxBuildsPerDay: number;      // Default: 3
  maxToolCodeLength: number;    // Default: 50000 chars

  // Pi SDK config
  piModelProvider?: string;     // Default: use Sonder's provider
  piModelName?: string;

  // Callbacks
  onToolBuilt?: (tool: UserTool) => void | Promise<void>;
  onToolActivated?: (tool: UserTool) => void | Promise<void>;
  onToolSubmitted?: (tool: UserTool) => void | Promise<void>;
}

// =============================================================================
// Executor Context Extension
// =============================================================================

export interface ToolForgeContext {
  forge: {
    buildTool: (request: ToolBuildRequest) => Promise<ToolBuildResult>;
    getUserTools: (userId: string) => UserTool[];
    getToolByName: (userId: string, name: string) => UserTool | undefined;
    activateTool: (toolId: string) => Promise<boolean>;
    disableTool: (toolId: string) => Promise<boolean>;
    submitTool: (toolId: string) => Promise<boolean>;
  };
}
