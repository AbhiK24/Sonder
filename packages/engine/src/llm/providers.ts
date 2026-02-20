/**
 * LLM Provider Factory
 *
 * BYOM - Bring Your Own Model
 * Supports: Ollama, OpenAI-compatible, Anthropic, MiniMax, Kimi (Moonshot)
 */

import type { LLMProvider, ModelConfig, GenerateOptions } from '../types/index.js';

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
 * OpenAI-compatible API
 * International: https://api.moonshot.ai/v1
 * China: https://api.moonshot.cn/v1
 * Models: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
 */
class KimiProvider implements LLMProvider {
  name = 'kimi';
  private endpoint: string;
  private model: string;
  private apiKey: string;

  constructor(config: ModelConfig) {
    this.endpoint = config.endpoint ?? 'https://api.moonshot.ai/v1';
    this.model = config.modelName ?? 'moonshot-v1-32k';
    this.apiKey = config.apiKey!;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
      { role: 'user', content: prompt }
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 500,
    };

    // Kimi supports web search via builtin_function tool (K2 models) or use_search (v1 models)
    if (options?.useSearch) {
      // For K2 models, use builtin tool calling
      if (this.model.includes('k2') || this.model.includes('kimi-k2')) {
        body.tools = [{
          type: 'builtin_function',
          function: { name: '$web_search' }
        }];
        console.log('[Kimi] Using $web_search tool (K2 model)');
      } else {
        // For v1 models, use use_search parameter
        body.use_search = true;
        console.log('[Kimi] Using use_search parameter (v1 model)');
      }
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

    interface KimiResponse {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    }

    const data = await response.json() as KimiResponse;
    const choice = data.choices[0];

    // Handle tool calls (for K2 models with $web_search)
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      console.log('[Kimi] Processing tool calls:', choice.message.tool_calls.map(t => t.function.name));

      // For $web_search, Kimi executes it internally and returns results
      // We need to send the tool results back and get final response
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const toolCall of choice.message.tool_calls) {
        console.log('[Kimi] Tool call:', toolCall.function.name, 'args:', toolCall.function.arguments);
        if (toolCall.function.name === '$web_search') {
          // Kimi handles $web_search internally - we just acknowledge it
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolCall.function.arguments || '{}',
          });
        }
      }

      // Make follow-up call to get final response with search results
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
      return followUpData.choices[0].message.content || '';
    }

    return choice.message.content || '';
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
