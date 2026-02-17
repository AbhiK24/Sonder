/**
 * LLM Provider Factory
 *
 * BYOM - Bring Your Own Model
 * Supports: Ollama, OpenAI-compatible, Anthropic, MiniMax
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
