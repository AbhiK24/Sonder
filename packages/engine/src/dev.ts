#!/usr/bin/env node
/**
 * Sonder Dev REPL
 *
 * Simple terminal interface to test conversation with Maren.
 * Run: pnpm dev
 */

import { createInterface } from 'readline';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createProvider } from './llm/providers.js';
import { loadIdentity, loadMemory, loadStatements } from './memory/files.js';
import type { ModelConfig, NPCIdentity, NPCMemory, Statement } from './types/index.js';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// Build model config from environment
function getModelConfig(): ModelConfig {
  const provider = process.env.LLM_PROVIDER ?? 'ollama';

  switch (provider) {
    case 'ollama':
      return {
        provider: 'ollama',
        modelName: process.env.OLLAMA_MODEL ?? 'qwen2.5:14b',
        endpoint: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434',
      };
    case 'openai':
      return {
        provider: 'openai',
        modelName: process.env.OPENAI_MODEL ?? 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY,
      };
    case 'anthropic':
      return {
        provider: 'anthropic',
        modelName: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY,
      };
    case 'kimi':
      return {
        provider: 'kimi',
        modelName: process.env.KIMI_MODEL ?? 'moonshot-v1-32k',
        apiKey: process.env.KIMI_API_KEY,
      };
    default:
      return {
        provider: 'ollama',
        modelName: 'qwen2.5:14b',
        endpoint: 'http://localhost:11434',
      };
  }
}

// Build NPC response prompt
function buildPrompt(
  identity: NPCIdentity,
  memory: NPCMemory,
  statements: Statement[],
  playerInput: string,
  conversationHistory: Array<{ role: 'player' | 'npc'; content: string }>
): string {
  const historyText = conversationHistory
    .map((m) => `${m.role === 'player' ? 'Player' : identity.name}: ${m.content}`)
    .join('\n');

  return `You are ${identity.name}, a character in a text-based tavern game.

## Your Identity
Role: ${identity.role}
Personality: ${identity.personality.join(', ')}

## Your Voice
${identity.voicePatterns.join('\n')}

## Example Phrases (use as style guide, don't repeat exactly)
${identity.examplePhrases.map((p) => `- "${p}"`).join('\n')}

## Your Quirks
${identity.quirks.join('\n')}

## What You Know About The Player
${memory.aboutPlayer.map((a) => `- ${a.content}`).join('\n') || '(Nothing yet - they just arrived)'}

## Current Conversation
${historyText}

Player: ${playerInput}

---
Respond as ${identity.name}. Stay in character. Keep responses conversational (1-3 sentences unless the moment calls for more). Show personality through word choice and rhythm, not exposition.

${identity.name}:`;
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          SONDER - Dev Mode             ║');
  console.log('║    Chat-based games with living NPCs   ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Get config
  const modelConfig = getModelConfig();
  console.log(`LLM Provider: ${modelConfig.provider}`);
  console.log(`Model: ${modelConfig.modelName}`);

  // Create provider
  const provider = createProvider(modelConfig);
  console.log('Provider initialized.\n');

  // Load Maren's identity
  const playPath = resolve(__dirname, '../../../packages/plays/wanderers-rest');
  const marenPath = resolve(playPath, 'npcs/maren');

  let identity: NPCIdentity;
  let memory: NPCMemory;
  let statements: Statement[];

  try {
    identity = await loadIdentity(resolve(marenPath, 'IDENTITY.md'));
    memory = await loadMemory(resolve(marenPath, 'MEMORY.md'));
    statements = await loadStatements(resolve(marenPath, 'STATEMENTS.md'));
    console.log(`Loaded NPC: ${identity.name} (${identity.role})\n`);
  } catch (error) {
    console.error('Failed to load Maren:', error);
    process.exit(1);
  }

  // Conversation history
  const history: Array<{ role: 'player' | 'npc'; content: string }> = [];

  // Scene setting
  console.log('━'.repeat(50));
  console.log('You step into Wanderer\'s Rest. The tavern is quiet');
  console.log('at this hour. Behind the bar, a weathered woman');
  console.log('with sharp eyes polishes a glass and watches you.');
  console.log('━'.repeat(50));
  console.log('\nType your messages. Press Ctrl+C to exit.\n');

  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('\x1b[36mYou: \x1b[0m', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === '/quit' || trimmed.toLowerCase() === '/exit') {
        console.log('\nMaren nods once. "Travel safe."\n');
        rl.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === '/help') {
        console.log('\n  /quit, /exit - Leave the tavern');
        console.log('  /clear       - Clear conversation history');
        console.log('  /debug       - Show debug info\n');
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === '/clear') {
        history.length = 0;
        console.log('\n(Conversation cleared)\n');
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === '/debug') {
        console.log('\n--- Debug Info ---');
        console.log('Provider:', modelConfig.provider);
        console.log('Model:', modelConfig.modelName);
        console.log('History length:', history.length);
        console.log('Identity loaded:', identity.name);
        console.log('------------------\n');
        prompt();
        return;
      }

      // Generate response
      try {
        const fullPrompt = buildPrompt(identity, memory, statements, trimmed, history);

        process.stdout.write(`\x1b[33m${identity.name}: \x1b[0m`);

        const response = await provider.generate(fullPrompt, {
          temperature: 0.8,
          maxTokens: 200,
        });

        const cleanResponse = response.trim();
        console.log(cleanResponse);
        console.log();

        // Update history
        history.push({ role: 'player', content: trimmed });
        history.push({ role: 'npc', content: cleanResponse });

        // Keep history manageable
        if (history.length > 20) {
          history.splice(0, 2);
        }
      } catch (error) {
        console.log(`\x1b[31m(Error: ${error instanceof Error ? error.message : 'Unknown error'})\x1b[0m\n`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
