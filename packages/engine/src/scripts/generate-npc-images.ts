#!/usr/bin/env node
/**
 * Generate NPC Images
 *
 * Generates portrait images for all NPCs using DALL-E 3.
 * Run: pnpm generate-images [npc-name]
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { ImageGenerator, buildNPCPrompt } from '../utils/image-generator.js';
import { loadIdentity } from '../memory/files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env - try multiple paths
const envPaths = [
  resolve(__dirname, '../../../../.env'),      // From src/scripts/
  resolve(__dirname, '../../../.env'),         // From packages/engine/
  resolve(__dirname, '../../../../../.env'),   // Deeper nesting
  resolve(process.cwd(), '.env'),              // Current working directory
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
const outputDir = resolve(projectRoot, 'packages/dashboard/assets/npcs');

// NPC categories
const NPC_CATEGORIES: Record<string, string> = {
  maren: 'townspeople',
  aldric: 'townspeople',
  elena: 'townspeople',
  thom: 'townspeople',
  kira: 'visitor',
  hooded: 'stranger',
};

// Custom appearance overrides for better images
const APPEARANCE_OVERRIDES: Record<string, string> = {
  maren: 'middle-aged woman with weathered face, silver-streaked dark hair pulled back in a practical bun, knowing tired eyes with crow\'s feet, wearing simple linen blouse with rolled sleeves, strong capable hands',
  kira: 'young woman late 20s, dark curly hair, sharp observant brown eyes, slight mysterious smile, wearing traveling cloak with hood down, silver hoop earring, warm olive skin',
  aldric: 'burly middle-aged man, strong square jaw, short cropped grey hair, squinting eyes from forge work, soot marks on face, burn scars on forearms, wearing leather apron over rough shirt',
  elena: 'gentle woman in her 40s, long auburn hair with small braids and dried herbs woven in, soft green knowing eyes, delicate features, wearing earth-toned dress with embroidered leaf patterns',
  thom: 'stern man in his 50s, military bearing, salt-and-pepper beard trimmed short, cold grey calculating eyes, old scar across left cheek, wearing guard uniform with captain insignia, chain mail visible',
  hooded: 'mysterious figure, face completely hidden in deep black hood shadow, only hint of pale jaw visible, dark cloak, ominous presence, single candle casting dramatic shadows, threatening atmosphere',
};

async function generateForNPC(
  generator: ImageGenerator,
  npcId: string
): Promise<void> {
  const npcPath = resolve(npcsDir, npcId);
  const identityPath = resolve(npcPath, 'IDENTITY.md');

  if (!existsSync(identityPath)) {
    console.log(`  Skipping ${npcId}: No IDENTITY.md found`);
    return;
  }

  const outputPath = resolve(outputDir, `${npcId}.png`);

  // Check if image already exists
  if (existsSync(outputPath)) {
    console.log(`  Skipping ${npcId}: Image already exists`);
    return;
  }

  try {
    const identity = await loadIdentity(identityPath);
    const category = NPC_CATEGORIES[npcId] || 'townspeople';
    const appearance = APPEARANCE_OVERRIDES[npcId];

    console.log(`\nGenerating: ${identity.name} (${identity.role})`);
    console.log(`  Category: ${category}`);

    const result = await generator.generateAndSave(
      identity.name,
      identity.role,
      category,
      identity.personality,
      outputPath,
      appearance
    );

    console.log(`  Saved to: ${result.savedTo}`);
    console.log(`  Revised prompt: ${result.revisedPrompt.slice(0, 100)}...`);

  } catch (error) {
    console.error(`  Error generating ${npcId}:`, error);
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not set in .env');
    process.exit(1);
  }

  const generator = new ImageGenerator({
    apiKey,
    size: '1024x1024',
    quality: 'standard',
    style: 'vivid',
  });

  // Get specific NPC from args, or do all
  const targetNPC = process.argv[2];

  console.log('='.repeat(50));
  console.log('NPC Portrait Generator');
  console.log('='.repeat(50));
  console.log(`NPCs directory: ${npcsDir}`);
  console.log(`Output directory: ${outputDir}`);

  if (targetNPC) {
    // Generate for specific NPC
    console.log(`\nGenerating for: ${targetNPC}`);
    await generateForNPC(generator, targetNPC);
  } else {
    // Generate for all NPCs
    const npcIds = readdirSync(npcsDir).filter(f => {
      const p = resolve(npcsDir, f, 'IDENTITY.md');
      return existsSync(p);
    });

    console.log(`\nFound ${npcIds.length} NPCs: ${npcIds.join(', ')}`);

    for (const npcId of npcIds) {
      await generateForNPC(generator, npcId);

      // Rate limiting - wait between requests
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Done!');
}

main().catch(console.error);
