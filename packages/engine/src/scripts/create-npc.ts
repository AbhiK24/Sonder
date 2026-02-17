#!/usr/bin/env node
/**
 * Create NPC
 *
 * Interactive script to create a new NPC with identity, memory, statements, and portrait.
 * Run: pnpm create-npc
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as readline from 'readline';
import { ImageGenerator } from '../utils/image-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env - try multiple paths
const envPaths = [
  resolve(__dirname, '../../../../.env'),
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../../../../../.env'),
  resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

// Paths - resolve from project root
const projectRoot = resolve(__dirname, '../../../..');
const npcsDir = resolve(projectRoot, 'packages/souls/wanderers-rest/npcs');
const imagesDir = resolve(projectRoot, 'packages/dashboard/assets/npcs');

// readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function askMultiple(question: string): Promise<string[]> {
  return new Promise(resolve => {
    rl.question(question + ' (comma-separated): ', answer => {
      resolve(answer.split(',').map(s => s.trim()).filter(Boolean));
    });
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('NPC Creator - Wanderer\'s Rest');
  console.log('='.repeat(50));
  console.log();

  // Basic info
  const id = (await ask('NPC ID (lowercase, no spaces): ')).toLowerCase().replace(/\s+/g, '-');
  const name = await ask('Display Name: ');
  const role = await ask('Role (e.g., Blacksmith, Merchant): ');
  const category = await ask('Category (townspeople/visitor/stranger): ') || 'townspeople';

  // Personality
  console.log('\nPersonality traits define how they act...');
  const personality = await askMultiple('Personality traits');

  // Voice
  console.log('\nVoice patterns define how they speak...');
  const voicePatterns = await askMultiple('Voice patterns (e.g., "Short sentences", "Uses metaphors")');

  // Example phrases
  console.log('\nExample phrases they might say...');
  const examplePhrases = await askMultiple('Example phrases');

  // Quirks
  console.log('\nQuirks are small details that make them memorable...');
  const quirks = await askMultiple('Quirks (e.g., "Always taps fingers", "Smells of smoke")');

  // Secrets
  console.log('\nSecrets are what they hide from the player...');
  const secrets = await askMultiple('Secrets');

  // Appearance for image generation
  console.log('\nDescribe their appearance for portrait generation...');
  const appearance = await ask('Appearance (detailed physical description): ');

  // Create directory
  const npcDir = resolve(npcsDir, id);
  if (existsSync(npcDir)) {
    console.log(`\nERROR: NPC '${id}' already exists!`);
    rl.close();
    process.exit(1);
  }

  mkdirSync(npcDir, { recursive: true });

  // Generate IDENTITY.md
  const identityContent = `# ${name}

## Role
${role}

## Category
${category.charAt(0).toUpperCase() + category.slice(1)}

## Personality
${personality.map(p => `- ${p}`).join('\n')}

## Voice Patterns
${voicePatterns.map(v => `- ${v}`).join('\n')}

## Example Phrases
${examplePhrases.map(p => `- "${p}"`).join('\n')}

## Quirks
${quirks.map(q => `- ${q}`).join('\n')}

## Secrets
${secrets.map(s => `- ${s}`).join('\n')}
`;

  writeFileSync(resolve(npcDir, 'IDENTITY.md'), identityContent);
  console.log(`\nCreated: ${npcDir}/IDENTITY.md`);

  // Generate MEMORY.md
  const memoryContent = `# Memory

## About Player

(No memories yet - hasn't met the new tavern owner)

## About the Tavern

- [Day 1] Wanderer's Rest has been here for generations.

## About Others

(Add memories about other NPCs here)
`;

  writeFileSync(resolve(npcDir, 'MEMORY.md'), memoryContent);
  console.log(`Created: ${npcDir}/MEMORY.md`);

  // Generate STATEMENTS.md
  const statementsContent = `# Statements

## Verifiable Claims

(Add claims that can be verified by other NPCs or evidence)

## Unverified Claims

(Add claims that haven't been verified yet)

## What They Won't Say (Until High Trust)

(Add secrets that require high trust to reveal)
`;

  writeFileSync(resolve(npcDir, 'STATEMENTS.md'), statementsContent);
  console.log(`Created: ${npcDir}/STATEMENTS.md`);

  // Generate portrait image
  const generateImage = await ask('\nGenerate portrait image? (y/n): ');

  if (generateImage.toLowerCase() === 'y') {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.log('WARNING: OPENAI_API_KEY not set. Skipping image generation.');
    } else {
      console.log('\nGenerating portrait with DALL-E 3...');

      try {
        const generator = new ImageGenerator({
          apiKey,
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        });

        const imagePath = resolve(imagesDir, `${id}.png`);

        const result = await generator.generateAndSave(
          name,
          role,
          category,
          personality,
          imagePath,
          appearance
        );

        console.log(`Portrait saved: ${result.savedTo}`);
        console.log(`Revised prompt: ${result.revisedPrompt.slice(0, 100)}...`);

      } catch (error) {
        console.error('Image generation failed:', error);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`NPC '${name}' created successfully!`);
  console.log('='.repeat(50));
  console.log('\nNext steps:');
  console.log(`1. Edit ${npcDir}/MEMORY.md to add memories about other NPCs`);
  console.log(`2. Edit ${npcDir}/STATEMENTS.md to add claims and secrets`);
  console.log(`3. Add NPC to telegram-bot.ts npcIds array`);
  console.log(`4. Update NPC_META in dashboard.js`);

  rl.close();
}

main().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});
