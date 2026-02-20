/**
 * Tool Forge Storage
 *
 * Persistence layer for user-created tools.
 * Storage structure:
 *   ~/.sonder/tools/
 *     global/           - Approved community tools
 *     users/
 *       {userId}/       - Per-user tools
 *         registry.json - Tool metadata
 *         {name}.ts     - Tool source code
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import type { UserTool, UserToolRegistry, ToolStorageConfig } from './types.js';

// =============================================================================
// Tool Storage
// =============================================================================

export class ToolStorage {
  private config: Required<ToolStorageConfig>;

  constructor(config: ToolStorageConfig) {
    this.config = {
      baseDir: config.baseDir,
      globalDir: config.globalDir || join(config.baseDir, 'global'),
      usersDir: config.usersDir || join(config.baseDir, 'users'),
    };

    this.ensureDirectories();
  }

  // ---------------------------------------------------------------------------
  // Directory Management
  // ---------------------------------------------------------------------------

  private ensureDirectories(): void {
    const dirs = [
      this.config.baseDir,
      this.config.globalDir,
      this.config.usersDir,
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private getUserDir(userId: string): string {
    const dir = join(this.config.usersDir, userId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getRegistryPath(userId: string): string {
    return join(this.getUserDir(userId), 'registry.json');
  }

  private getToolPath(userId: string, toolName: string): string {
    return join(this.getUserDir(userId), `${toolName}.ts`);
  }

  private getGlobalToolPath(toolName: string): string {
    return join(this.config.globalDir, `${toolName}.ts`);
  }

  // ---------------------------------------------------------------------------
  // Registry Operations
  // ---------------------------------------------------------------------------

  loadUserRegistry(userId: string): UserToolRegistry {
    const path = this.getRegistryPath(userId);

    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        return {
          ...data,
          tools: (data.tools || []).map(this.deserializeTool),
          lastUpdated: new Date(data.lastUpdated),
        };
      } catch (error) {
        console.error(`[ToolStorage] Failed to load registry for ${userId}:`, error);
      }
    }

    // Return default registry
    return {
      userId,
      tools: [],
      lastUpdated: new Date(),
      settings: {
        maxTools: 10,
        dailyBuildLimit: 3,
        buildsToday: 0,
        lastBuildDate: new Date().toISOString().split('T')[0],
      },
    };
  }

  saveUserRegistry(registry: UserToolRegistry): void {
    const path = this.getRegistryPath(registry.userId);
    const data = {
      ...registry,
      tools: registry.tools.map(this.serializeTool),
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  }

  private serializeTool(tool: UserTool): any {
    return {
      ...tool,
      createdAt: tool.createdAt.toISOString(),
      updatedAt: tool.updatedAt.toISOString(),
      submittedAt: tool.submittedAt?.toISOString(),
      approvedAt: tool.approvedAt?.toISOString(),
      testResults: tool.testResults?.map(r => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
      })),
    };
  }

  private deserializeTool(data: any): UserTool {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      submittedAt: data.submittedAt ? new Date(data.submittedAt) : undefined,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : undefined,
      testResults: data.testResults?.map((r: any) => ({
        ...r,
        timestamp: new Date(r.timestamp),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Tool Source Code Operations
  // ---------------------------------------------------------------------------

  saveToolSource(userId: string, toolName: string, sourceCode: string): void {
    const path = this.getToolPath(userId, toolName);
    writeFileSync(path, sourceCode, 'utf-8');
  }

  loadToolSource(userId: string, toolName: string): string | null {
    const path = this.getToolPath(userId, toolName);
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
    return null;
  }

  deleteToolSource(userId: string, toolName: string): void {
    const path = this.getToolPath(userId, toolName);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  // ---------------------------------------------------------------------------
  // Global Tools
  // ---------------------------------------------------------------------------

  loadGlobalTools(): UserTool[] {
    const globalRegistry = join(this.config.globalDir, 'registry.json');

    if (existsSync(globalRegistry)) {
      try {
        const data = JSON.parse(readFileSync(globalRegistry, 'utf-8'));
        return (data.tools || []).map(this.deserializeTool);
      } catch (error) {
        console.error('[ToolStorage] Failed to load global registry:', error);
      }
    }

    return [];
  }

  saveGlobalTools(tools: UserTool[]): void {
    const globalRegistry = join(this.config.globalDir, 'registry.json');
    const data = {
      tools: tools.map(this.serializeTool),
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(globalRegistry, JSON.stringify(data, null, 2), 'utf-8');
  }

  promoteToGlobal(tool: UserTool): void {
    // Copy source to global directory
    const source = this.loadToolSource(tool.userId, tool.name);
    if (source) {
      const globalPath = this.getGlobalToolPath(tool.name);
      writeFileSync(globalPath, source, 'utf-8');
    }

    // Update global registry
    const globalTools = this.loadGlobalTools();
    const existing = globalTools.findIndex(t => t.name === tool.name);

    const globalTool: UserTool = {
      ...tool,
      scope: 'global',
      approvedAt: new Date(),
    };

    if (existing >= 0) {
      globalTools[existing] = globalTool;
    } else {
      globalTools.push(globalTool);
    }

    this.saveGlobalTools(globalTools);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  listUserToolNames(userId: string): string[] {
    const userDir = this.getUserDir(userId);
    if (!existsSync(userDir)) return [];

    return readdirSync(userDir)
      .filter(f => f.endsWith('.ts') && f !== 'registry.json')
      .map(f => f.replace('.ts', ''));
  }

  toolExists(userId: string, toolName: string): boolean {
    return existsSync(this.getToolPath(userId, toolName));
  }

  getStorageStats(): { users: number; globalTools: number } {
    let users = 0;
    let globalTools = 0;

    if (existsSync(this.config.usersDir)) {
      users = readdirSync(this.config.usersDir).length;
    }

    globalTools = this.loadGlobalTools().length;

    return { users, globalTools };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createToolStorage(baseDir: string): ToolStorage {
  return new ToolStorage({ baseDir });
}
