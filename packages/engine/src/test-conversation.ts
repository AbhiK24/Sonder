/**
 * Quick conversation test - no readline
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createProvider } from './llm/providers.js';
import { loadIdentity, loadMemory, loadStatements } from './memory/files.js';
import type { ModelConfig, NPCIdentity, NPCMemory, Statement } from './types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

function getModelConfig(): ModelConfig {
  return {
    provider: 'kimi',
    modelName: process.env.KIMI_MODEL ?? 'moonshot-v1-32k',
    apiKey: process.env.KIMI_API_KEY,
  };
}

function buildPrompt(
  identity: NPCIdentity,
  memory: NPCMemory,
  playerInput: string,
  history: Array<{ role: 'player' | 'npc'; content: string }>
): string {
  const historyText = history
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

## Current Conversation
${historyText}

Player: ${playerInput}

---
Respond as ${identity.name}. Stay in character. Keep responses conversational (1-3 sentences). Show personality through word choice and rhythm.

${identity.name}:`;
}

async function main() {
  console.log('\n=== Sonder Conversation Test ===\n');

  const provider = createProvider(getModelConfig());
  const playPath = resolve(__dirname, '../../../packages/plays/wanderers-rest');
  const marenPath = resolve(playPath, 'npcs/maren');

  const identity = await loadIdentity(resolve(marenPath, 'IDENTITY.md'));
  const memory = await loadMemory(resolve(marenPath, 'MEMORY.md'));

  console.log(`Talking to: ${identity.name} (${identity.role})\n`);
  console.log('---');

  const history: Array<{ role: 'player' | 'npc'; content: string }> = [];

  const messages = [
    "Hi Maren",
    "What's good to drink here?",
    "You've been here a long time, haven't you?",
    "What can you tell me about this place?"
  ];

  for (const msg of messages) {
    console.log(`\nYou: ${msg}`);

    const prompt = buildPrompt(identity, memory, msg, history);
    const response = await provider.generate(prompt, { temperature: 0.8, maxTokens: 150 });
    const clean = response.trim().replace(/^Maren:\s*/i, '');

    console.log(`Maren: ${clean}`);

    history.push({ role: 'player', content: msg });
    history.push({ role: 'npc', content: clean });

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n---');
  console.log('Test complete!\n');
}

main().catch(console.error);
