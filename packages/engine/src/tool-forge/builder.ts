/**
 * Tool Builder
 *
 * Uses Pi coding agent to build new tools based on user requirements.
 * The agent writes TypeScript code, tests it, and iterates until working.
 */

import { randomUUID } from 'crypto';
import type { LLMProvider } from '../types/index.js';
import type { UserTool, ToolBuildRequest, ToolBuildResult, TestResult } from './types.js';
import { ToolStorage } from './storage.js';

// =============================================================================
// Tool Template
// =============================================================================

const TOOL_TEMPLATE = `/**
 * {{NAME}} - User-created tool
 *
 * {{DESCRIPTION}}
 *
 * Created: {{DATE}}
 * Requirements: {{REQUIREMENTS}}
 */

import type { ToolResult, ToolContext } from '../tools/index.js';

// Tool definition (exported for registration)
export const definition = {
  name: '{{NAME}}',
  description: \`{{DESCRIPTION}}\`,
  parameters: {
    type: 'object',
    properties: {
      // Define your parameters here
      // Example:
      // query: { type: 'string', description: 'Search query' },
    },
    required: [],
  },
};

// Tool executor
export async function execute(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    // Implement your tool logic here
    // Available in context:
    // - context.userId
    // - context.userName
    // - context.agentId
    // - context.memory (remember/recall)
    // - etc.

    return {
      success: true,
      result: 'Tool executed successfully',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}
`;

// =============================================================================
// Build Prompt
// =============================================================================

function createBuildPrompt(request: ToolBuildRequest): string {
  return `You are building a Sonder tool. Create a TypeScript module that implements the following:

## Requirements
- **Name**: ${request.name}
- **Description**: ${request.description}
- **User Requirements**: ${request.requirements}

## Tool Structure
The tool must export:
1. \`definition\` - Tool definition object with name, description, and parameters schema
2. \`execute\` - Async function that takes (args, context) and returns ToolResult

## ToolResult Interface
\`\`\`typescript
interface ToolResult {
  success: boolean;
  result?: string;  // Success message/data
  error?: string;   // Error message if failed
}
\`\`\`

## ToolContext Available Fields
\`\`\`typescript
interface ToolContext {
  userId: string;
  userName?: string;
  agentId?: string;
  agentName?: string;
  timezone?: string;
  memory?: {
    remember: (text: string, metadata?: any) => Promise<void>;
    recall: (query: string, opts?: any) => Promise<string[]>;
  };
}
\`\`\`

## Example Tool
\`\`\`typescript
export const definition = {
  name: 'weather_check',
  description: 'Check current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City or location name' },
    },
    required: ['location'],
  },
};

export async function execute(args, context) {
  const { location } = args;

  try {
    // Fetch weather data
    const response = await fetch(\`https://wttr.in/\${encodeURIComponent(location)}?format=j1\`);
    const data = await response.json();

    const current = data.current_condition[0];
    const temp = current.temp_C;
    const desc = current.weatherDesc[0].value;

    return {
      success: true,
      result: \`Weather in \${location}: \${temp}°C, \${desc}\`,
    };
  } catch (error) {
    return {
      success: false,
      error: \`Failed to get weather: \${error.message}\`,
    };
  }
}
\`\`\`

## Guidelines
1. Handle errors gracefully - always return ToolResult
2. Validate input parameters
3. Use descriptive parameter descriptions for the LLM
4. Keep the tool focused on one task
5. If the tool needs API keys, check for them in process.env
6. Log important actions with console.log for debugging

Now create the tool code. Return ONLY the TypeScript code, no explanations.`;
}

// =============================================================================
// Tool Builder
// =============================================================================

export class ToolBuilder {
  private provider: LLMProvider;
  private storage: ToolStorage;

  constructor(provider: LLMProvider, storage: ToolStorage) {
    this.provider = provider;
    this.storage = storage;
  }

  /**
   * Build a new tool using AI
   */
  async buildTool(request: ToolBuildRequest): Promise<ToolBuildResult> {
    const logs: string[] = [];
    logs.push(`[ToolBuilder] Starting build for ${request.name}`);

    try {
      // 1. Generate tool code using LLM
      logs.push('[ToolBuilder] Generating tool code...');
      const prompt = createBuildPrompt(request);
      const generatedCode = await this.provider.generate(prompt, {
        temperature: 0.3,  // Lower temp for more deterministic code
        maxTokens: 2000,
      });

      // 2. Extract code from response (handle markdown code blocks)
      const sourceCode = this.extractCode(generatedCode);
      if (!sourceCode) {
        return {
          success: false,
          error: 'Failed to generate valid tool code',
          logs,
        };
      }
      logs.push(`[ToolBuilder] Generated ${sourceCode.length} chars of code`);

      // 3. Validate the code structure
      logs.push('[ToolBuilder] Validating code structure...');
      const validation = this.validateToolCode(sourceCode);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid tool code: ${validation.error}`,
          logs,
        };
      }
      logs.push('[ToolBuilder] Code structure valid');

      // 4. Create UserTool object
      const tool: UserTool = {
        id: randomUUID(),
        userId: request.userId,
        name: request.name,
        description: request.description,
        parameters: validation.parameters!,
        sourceCode,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: request.agentId || 'system',
        version: 1,
        status: 'draft',
        scope: 'private',
      };

      // 5. Save source code
      logs.push('[ToolBuilder] Saving tool source...');
      this.storage.saveToolSource(request.userId, request.name, sourceCode);

      logs.push(`[ToolBuilder] Tool ${request.name} built successfully`);
      return {
        success: true,
        tool,
        logs,
      };
    } catch (error) {
      logs.push(`[ToolBuilder] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Build failed',
        logs,
      };
    }
  }

  /**
   * Test a tool with sample inputs
   */
  async testTool(tool: UserTool, testInputs?: Record<string, unknown>[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    try {
      // Compile the tool
      const executor = await this.compileExecutor(tool.sourceCode);
      if (!executor) {
        results.push({
          passed: false,
          output: 'Failed to compile tool',
          timestamp: new Date(),
          testCase: 'compilation',
        });
        return results;
      }

      // Test with empty context (basic sanity check)
      const mockContext = {
        userId: tool.userId,
        userName: 'TestUser',
        agentId: 'test',
        timezone: 'UTC',
      };

      // Run with provided inputs or empty object
      const inputs = testInputs || [{}];

      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        try {
          const result = await executor(input, mockContext as any);

          results.push({
            passed: result.success !== false,
            output: result.success ? (result.result || 'Success') : (result.error || 'Failed'),
            timestamp: new Date(),
            testCase: `test_${i + 1}`,
          });
        } catch (error) {
          results.push({
            passed: false,
            output: error instanceof Error ? error.message : 'Execution error',
            timestamp: new Date(),
            testCase: `test_${i + 1}`,
          });
        }
      }
    } catch (error) {
      results.push({
        passed: false,
        output: error instanceof Error ? error.message : 'Test setup failed',
        timestamp: new Date(),
        testCase: 'setup',
      });
    }

    return results;
  }

  /**
   * Improve a tool based on test failures
   */
  async improveTool(tool: UserTool, testResults: TestResult[]): Promise<ToolBuildResult> {
    const failedTests = testResults.filter(r => !r.passed);
    if (failedTests.length === 0) {
      return { success: true, tool };
    }

    const improvementPrompt = `The following tool has test failures. Fix the issues:

## Current Code
\`\`\`typescript
${tool.sourceCode}
\`\`\`

## Test Failures
${failedTests.map(t => `- ${t.testCase}: ${t.output}`).join('\n')}

## Instructions
1. Analyze the failures
2. Fix the issues in the code
3. Return the complete fixed code

Return ONLY the fixed TypeScript code, no explanations.`;

    try {
      const improvedCode = await this.provider.generate(improvementPrompt, {
        temperature: 0.2,
        maxTokens: 2000,
      });

      const sourceCode = this.extractCode(improvedCode);
      if (!sourceCode) {
        return { success: false, error: 'Failed to generate improved code' };
      }

      const validation = this.validateToolCode(sourceCode);
      if (!validation.valid) {
        return { success: false, error: `Invalid improved code: ${validation.error}` };
      }

      const improvedTool: UserTool = {
        ...tool,
        sourceCode,
        updatedAt: new Date(),
        version: tool.version + 1,
      };

      this.storage.saveToolSource(tool.userId, tool.name, sourceCode);

      return { success: true, tool: improvedTool };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Improvement failed',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractCode(response: string): string | null {
    // Try to extract from markdown code block
    const codeBlockMatch = response.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, check if the response looks like code
    if (response.includes('export') && response.includes('function')) {
      return response.trim();
    }

    return null;
  }

  private validateToolCode(code: string): {
    valid: boolean;
    error?: string;
    parameters?: any;
  } {
    // Check for required exports
    if (!code.includes('export const definition') && !code.includes('export { definition')) {
      return { valid: false, error: 'Missing definition export' };
    }

    if (!code.includes('export async function execute') && !code.includes('export function execute')) {
      return { valid: false, error: 'Missing execute export' };
    }

    // Try to extract parameters from definition
    const defMatch = code.match(/definition\s*=\s*\{[\s\S]*?parameters\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
    let parameters = {
      type: 'object',
      properties: {},
      required: [],
    };

    if (defMatch) {
      try {
        // Safe parameter extraction - no eval()
        // Parse the object literal string safely
        const paramStr = defMatch[1]
          .replace(/'/g, '"')  // Convert single quotes to double
          .replace(/(\w+):/g, '"$1":')  // Quote unquoted keys
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']');
        parameters = JSON.parse(paramStr);
      } catch {
        // Use default parameters if extraction fails
        console.warn('[ToolBuilder] Could not parse parameters, using defaults');
      }
    }

    return { valid: true, parameters };
  }

  private async compileExecutor(source: string): Promise<((args: any, context: any) => Promise<any>) | null> {
    try {
      // Security checks - block dangerous patterns
      const dangerousPatterns = [
        /\brequire\s*\(/,           // No require()
        /\bprocess\./,              // No process access
        /\b__dirname\b/,            // No path access
        /\b__filename\b/,
        /\beval\s*\(/,              // No eval
        /\bFunction\s*\(/,          // No Function constructor
        /child_process/,            // No spawning
        /\bfs\b/,                   // No filesystem (except fetch)
        /\.env\b/,                  // No env access directly
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(source)) {
          console.error(`[ToolBuilder] Security violation: ${pattern}`);
          return null;
        }
      }

      // Wrap source with limited globals
      const wrappedSource = `
        const module = { exports: {} };
        const exports = module.exports;
        // Limited global access - only safe APIs
        const console = { log: (...args) => {}, warn: (...args) => {}, error: (...args) => {} };
        ${source.replace(/export\s+const\s+/g, 'module.exports.').replace(/export\s+(async\s+)?function\s+/g, 'module.exports.')}
        return module.exports;
      `;

      const moduleExports = new Function(wrappedSource)();

      if (typeof moduleExports.execute === 'function') {
        // Wrap executor with timeout
        const originalExecute = moduleExports.execute;
        return async (args: any, context: any) => {
          const timeoutMs = 10000; // 10 second timeout for user tools
          return Promise.race([
            originalExecute(args, context),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Tool execution timed out')), timeoutMs)
            )
          ]);
        };
      }

      return null;
    } catch (error) {
      console.error('[ToolBuilder] Compilation error:', error);
      return null;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createToolBuilder(provider: LLMProvider, storage: ToolStorage): ToolBuilder {
  return new ToolBuilder(provider, storage);
}
