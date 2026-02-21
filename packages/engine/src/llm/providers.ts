/**
 * LLM Provider Factory
 *
 * BYOM - Bring Your Own Model
 * Supports: Ollama, OpenAI-compatible, Anthropic, MiniMax, Kimi (Moonshot)
 */

import type { LLMProvider, ModelConfig, GenerateOptions, GenerateWithToolsResult, ToolCallFromLLM } from '../types/index.js';

/**
 * Create an LLM provider based on config
 */
export function createProvider(config: ModelConfig): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
    case 'lmstudio':
      return new OpenAICompatibleProvider(config);
    case 'kimi':
      return new KimiProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'minimax':
      return new MiniMaxProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Ollama Provider (local)
 */
class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private endpoint: string;
  private model: string;

  constructor(config: ModelConfig) {
    this.endpoint = config.endpoint ?? 'http://localhost:11434';
    this.model = config.modelName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.8,
          num_predict: options?.maxTokens ?? 500,
        },
      }),
    });

    const data = await response.json() as { response: string };
    return data.response;
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.generate(
      prompt + '\n\nRespond with valid JSON only.',
      options
    );

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }
}

/**
 * OpenAI-compatible Provider (OpenAI, LM Studio, vLLM, etc.)
 */
class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  private endpoint: string;
  private model: string;
  private apiKey?: string;

  constructor(config: ModelConfig) {
    this.name = config.provider;
    this.endpoint = config.endpoint ?? 'https://api.openai.com/v1';
    this.model = config.modelName;
    this.apiKey = config.apiKey;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.generate(
      prompt + '\n\nRespond with valid JSON only.',
      options
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }
}

/**
 * Kimi Provider (Moonshot AI)
 * OpenAI-compatible API with native tool calling support
 *
 * International: https://api.moonshot.ai/v1
 * China: https://api.moonshot.cn/v1
 * Models: kimi-k2-0711-preview (latest), moonshot-v1-8k/32k/128k
 *
 * Tool Call ID Format: functions.func_name:idx
 * Tool Definition Format: { type: "function", function: { name, description, parameters } }
 */
class KimiProvider implements LLMProvider {
  name = 'kimi';
  private endpoint: string;
  private model: string;
  private apiKey: string;

  constructor(config: ModelConfig) {
    this.endpoint = config.endpoint ?? 'https://api.moonshot.ai/v1';
    this.model = config.modelName ?? 'kimi-k2-0711-preview';
    this.apiKey = config.apiKey!;
  }

  /**
   * Generate with optional native tool calling
   * Returns structured result with tool calls if model requests them
   */
  async generateWithTools(prompt: string, options?: GenerateOptions): Promise<GenerateWithToolsResult> {
    const messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }> = [
      { role: 'user', content: prompt }
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 500,
    };

    // Build tools array
    const tools: Array<{ type: string; function?: unknown }> = [];

    // Add custom tools if provided (convert to Kimi format)
    if (options?.tools && options.tools.length > 0) {
      for (const tool of options.tools) {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          }
        });
      }
    }

    // Add web search for K2 models
    if (options?.useSearch && (this.model.includes('k2') || this.model.includes('kimi-k2'))) {
      tools.push({
        type: 'builtin_function',
        function: { name: '$web_search' }
      });
    }

    if (tools.length > 0) {
      body.tools = tools;
      console.log('[Kimi] Tools enabled:', tools.map(t => t.function && typeof t.function === 'object' && 'name' in t.function ? (t.function as {name: string}).name : 'builtin'));
    }

    // Use use_search for v1 models
    if (options?.useSearch && !this.model.includes('k2') && !this.model.includes('kimi-k2')) {
      body.use_search = true;
    }

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    interface KimiToolCall {
      id: string;  // Format: functions.func_name:idx
      type: string;
      function: { name: string; arguments: string };
    }

    interface KimiResponse {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: KimiToolCall[];
        };
        finish_reason: 'stop' | 'tool_calls' | 'length';
      }>;
    }

    const data = await response.json() as KimiResponse;
    const choice = data.choices[0];

    // Handle tool calls
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const toolCalls: ToolCallFromLLM[] = [];

      for (const tc of choice.message.tool_calls) {
        // Skip internal tools like $web_search - handle them separately
        if (tc.function.name.startsWith('$')) {
          continue;
        }

        try {
          // Handle malformed arguments gracefully
          let args: Record<string, unknown> = {};
          const rawArgs = tc.function.arguments || '{}';

          if (rawArgs.trim()) {
            try {
              args = JSON.parse(rawArgs);
            } catch (parseError) {
              // Try to salvage - sometimes LLM sends incomplete JSON
              console.warn(`[Kimi] Malformed tool args for ${tc.function.name}, attempting recovery:`, rawArgs);

              // Try to extract key-value pairs from malformed JSON
              const keyValueMatch = rawArgs.match(/"(\w+)":\s*"([^"]+)"/g);
              if (keyValueMatch) {
                for (const match of keyValueMatch) {
                  const [, key, value] = match.match(/"(\w+)":\s*"([^"]+)"/) || [];
                  if (key && value) args[key] = value;
                }
              }

              // If still empty and there's content, try one more thing
              if (Object.keys(args).length === 0 && rawArgs.includes(':')) {
                console.error('[Kimi] Could not recover tool args:', rawArgs);
                // Add the tool call anyway with empty args - let the executor handle it
              }
            }
          }

          // Validate required fields based on tool name
          if (typeof args !== 'object' || Array.isArray(args)) {
            console.error(`[Kimi] Invalid args type for ${tc.function.name}:`, typeof args);
            args = {};
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        } catch (e) {
          console.error('[Kimi] Failed to process tool call:', tc.function.name, e);
          // Still add the tool call with empty args so we can report the error
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: {},
          });
        }
      }

      // If we have custom tool calls, return them for external execution
      if (toolCalls.length > 0) {
        return {
          content: choice.message.content || '',
          toolCalls,
          finishReason: 'tool_calls',
        };
      }

      // Handle $web_search internally
      const webSearchCalls = choice.message.tool_calls.filter(tc => tc.function.name === '$web_search');
      if (webSearchCalls.length > 0) {
        // Kimi handles web search internally - send acknowledgment and get final response
        const toolResults = webSearchCalls.map(tc => ({
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: tc.function.arguments || '{}',
        }));

        const followUpBody = {
          model: this.model,
          messages: [
            ...messages,
            { role: 'assistant', content: null, tool_calls: choice.message.tool_calls },
            ...toolResults,
          ],
          temperature: options?.temperature ?? 0.8,
          max_tokens: options?.maxTokens ?? 500,
        };

        const followUpResponse = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(followUpBody),
        });

        if (!followUpResponse.ok) {
          const error = await followUpResponse.text();
          throw new Error(`Kimi API error on follow-up: ${followUpResponse.status} - ${error}`);
        }

        const followUpData = await followUpResponse.json() as KimiResponse;
        return {
          content: followUpData.choices[0].message.content || '',
          finishReason: followUpData.choices[0].finish_reason,
        };
      }
    }

    return {
      content: choice.message.content || '',
      finishReason: choice.finish_reason,
    };
  }

  /**
   * Send tool execution results back to Kimi and get final response
   */
  async continueWithToolResults(
    originalPrompt: string,
    assistantToolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    toolResults: Array<{ tool_call_id: string; content: string }>,
    options?: GenerateOptions
  ): Promise<string> {
    const messages = [
      { role: 'user', content: originalPrompt },
      { role: 'assistant', content: null, tool_calls: assistantToolCalls },
      ...toolResults.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content })),
    ];

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string | null } }> };
    return data.choices[0].message.content || '';
  }

  /**
   * Simple generate (backwards compatible - no tool calling)
   * Explicitly removes tools to prevent tool_calls response
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // Don't pass tools - we want a direct text response
    const optionsWithoutTools = options ? { ...options, tools: undefined } : options;
    const result = await this.generateWithTools(prompt, optionsWithoutTools);
    return result.content;
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.generate(
      prompt + '\n\nRespond with valid JSON only.',
      options
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }
}

/**
 * Anthropic Provider (Claude)
 */
class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private model: string;
  private apiKey: string;

  constructor(config: ModelConfig) {
    this.model = config.modelName;
    this.apiKey = config.apiKey!;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0].text;
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.generate(
      prompt + '\n\nRespond with valid JSON only.',
      options
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }
}

/**
 * MiniMax Provider (4M context)
 */
class MiniMaxProvider implements LLMProvider {
  name = 'minimax';
  private model: string;
  private apiKey: string;

  constructor(config: ModelConfig) {
    this.model = config.modelName ?? 'MiniMax-Text-01';
    this.apiKey = config.apiKey!;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // MiniMax API implementation
    // See: https://www.minimax.chat/document/guides/chat
    throw new Error('MiniMax provider not yet implemented');
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.generate(prompt, options);
    return JSON.parse(response) as T;
  }
}
