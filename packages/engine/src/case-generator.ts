/**
 * Case Generator
 *
 * Auto-generates new mysteries using LLM when player is close to solving current case.
 * Maintains continuity with previous cases and introduces new characters.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { LLMProvider } from './types/index.js';

// =============================================================================
// Types
// =============================================================================

export interface GeneratedCase {
  id: string;
  name: string;
  tagline: string;
  description: string;
  newNPCs: Array<{
    id: string;
    name: string;
    emoji: string;
    role: string;
    introduction: string;
    personality: string[];
    facts: string[];
    possibleLies: string[];
  }>;
  days: Array<{
    day: number;
    digest: string;
    statements: Array<{
      speakerId: string;
      speakerName: string;
      speakerEmoji: string;
      statement: string;
      isLie: boolean;
    }>;
    correctAnswer: number;
    revelation: string;
  }>;
  resolution: string;
  nextCaseTeaser: string;
}

export interface CaseGeneratorConfig {
  provider: LLMProvider;
  outputDir: string;
  existingNPCs: Array<{ id: string; name: string; emoji: string; role: string }>;
  previousCases: Array<{ id: string; name: string; resolution: string }>;
  worldContext: string;
}

// =============================================================================
// Case Generator
// =============================================================================

export class CaseGenerator {
  private provider: LLMProvider;
  private outputDir: string;
  private existingNPCs: CaseGeneratorConfig['existingNPCs'];
  private previousCases: CaseGeneratorConfig['previousCases'];
  private worldContext: string;
  private isGenerating = false;
  private generationQueue: Array<{ caseNumber: number; resolve: (c: GeneratedCase) => void }> = [];

  constructor(config: CaseGeneratorConfig) {
    this.provider = config.provider;
    this.outputDir = config.outputDir;
    this.existingNPCs = config.existingNPCs;
    this.previousCases = config.previousCases;
    this.worldContext = config.worldContext;

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Check if we should start generating the next case
   * Called when player makes progress
   */
  shouldTriggerGeneration(currentPoints: number, targetPoints: number, nextCaseExists: boolean): boolean {
    // Start generating when player is 80% done and next case doesn't exist
    const threshold = Math.floor(targetPoints * 0.8);
    return currentPoints >= threshold && !nextCaseExists && !this.isGenerating;
  }

  /**
   * Generate a new case in the background
   */
  async generateNextCase(caseNumber: number): Promise<GeneratedCase> {
    // Check if already generated
    const cachePath = resolve(this.outputDir, `case-${caseNumber.toString().padStart(2, '0')}.json`);
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
      return cached as GeneratedCase;
    }

    this.isGenerating = true;
    console.log(`[CaseGenerator] Starting generation for Case ${caseNumber}...`);

    try {
      // Generate the case structure
      const caseStructure = await this.generateCaseStructure(caseNumber);

      // Generate all 15 days of content
      const days = await this.generateAllDays(caseStructure, caseNumber);
      caseStructure.days = days;

      // Save to cache
      writeFileSync(cachePath, JSON.stringify(caseStructure, null, 2));
      console.log(`[CaseGenerator] Case ${caseNumber} generated and saved.`);

      return caseStructure;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Generate the case structure (name, NPCs, premise)
   */
  private async generateCaseStructure(caseNumber: number): Promise<GeneratedCase> {
    const prompt = `You are a mystery writer for a tavern-based detective game called "Wanderer's Rest".

WORLD CONTEXT:
${this.worldContext}

EXISTING RECURRING NPCS:
${this.existingNPCs.map(n => `- ${n.emoji} ${n.name} (${n.role})`).join('\n')}

PREVIOUS CASES:
${this.previousCases.map(c => `- "${c.name}": ${c.resolution.slice(0, 200)}...`).join('\n')}

Generate Case #${caseNumber} - a new mystery for the tavern.

Requirements:
1. Connect to the overarching Black Sun storyline
2. Introduce 2-3 NEW characters (not from existing NPCs)
3. Make it distinct from previous cases but thematically connected
4. The mystery should be solvable through daily "spot the lie" puzzles

Return ONLY valid JSON in this exact format:
{
  "id": "case-slug-here",
  "name": "The Case Name",
  "tagline": "A short dramatic tagline",
  "description": "2-3 sentences describing the mystery premise",
  "newNPCs": [
    {
      "id": "npc_id",
      "name": "Name",
      "emoji": "🎭",
      "role": "Their Role",
      "introduction": "How they appear at the tavern",
      "personality": ["trait1", "trait2"],
      "facts": ["true thing they know", "another truth"],
      "possibleLies": ["something they might lie about"]
    }
  ],
  "resolution": "Full explanation of what really happened (3-4 paragraphs)",
  "nextCaseTeaser": "A dramatic teaser for what comes next"
}`;

    const response = await this.provider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 2000,
    });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse case structure from LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeneratedCase;
    parsed.days = []; // Will be filled in separately
    return parsed;
  }

  /**
   * Generate all 15 days of puzzle content
   */
  private async generateAllDays(caseStructure: GeneratedCase, caseNumber: number): Promise<GeneratedCase['days']> {
    const days: GeneratedCase['days'] = [];

    // All available NPCs for this case
    const allNPCs = [
      ...this.existingNPCs,
      ...caseStructure.newNPCs.map(n => ({ id: n.id, name: n.name, emoji: n.emoji, role: n.role })),
    ];

    // Generate in batches of 5 to avoid token limits
    for (let batch = 0; batch < 3; batch++) {
      const startDay = batch * 5 + 1;
      const endDay = Math.min(startDay + 4, 15);

      const batchDays = await this.generateDayBatch(caseStructure, allNPCs, startDay, endDay);
      days.push(...batchDays);

      console.log(`[CaseGenerator] Generated days ${startDay}-${endDay} for Case ${caseNumber}`);
    }

    return days;
  }

  /**
   * Generate a batch of days
   */
  private async generateDayBatch(
    caseStructure: GeneratedCase,
    allNPCs: Array<{ id: string; name: string; emoji: string; role: string }>,
    startDay: number,
    endDay: number
  ): Promise<GeneratedCase['days']> {
    const prompt = `You are writing daily puzzle content for a mystery game.

CASE: "${caseStructure.name}"
${caseStructure.description}

AVAILABLE NPCS:
${allNPCs.map(n => `- ${n.emoji} ${n.name} (${n.role}) [id: ${n.id}]`).join('\n')}

NEW NPCS FOR THIS CASE:
${caseStructure.newNPCs.map(n => `- ${n.emoji} ${n.name}: ${n.introduction}
  Personality: ${n.personality.join(', ')}
  Facts they know: ${n.facts.join('; ')}
  Things they might lie about: ${n.possibleLies.join('; ')}`).join('\n\n')}

RESOLUTION (for reference - player discovers this at the end):
${caseStructure.resolution}

Generate days ${startDay} to ${endDay} of the investigation. Each day has:
1. A DIGEST: Rich narrative of what happened while player was away (include dialogue, 150-300 words)
2. Three STATEMENTS: 2 truths and 1 lie from different NPCs
3. The correct answer (which statement is the lie)
4. A REVELATION: What the player learns if they guess correctly

The digest should have subtle clues that hint at which statement is the lie.
Progress the story - early days are setup, middle days reveal clues, final days bring resolution.

Return ONLY valid JSON array:
[
  {
    "day": ${startDay},
    "digest": "Rich narrative with dialogue...",
    "statements": [
      {"speakerId": "npc_id", "speakerName": "Name", "speakerEmoji": "🎭", "statement": "What they claim", "isLie": false},
      {"speakerId": "npc_id", "speakerName": "Name", "speakerEmoji": "🎭", "statement": "What they claim", "isLie": true},
      {"speakerId": "npc_id", "speakerName": "Name", "speakerEmoji": "🎭", "statement": "What they claim", "isLie": false}
    ],
    "correctAnswer": 2,
    "revelation": "What this reveals about the mystery"
  }
]`;

    const response = await this.provider.generate(prompt, {
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(`Failed to parse days ${startDay}-${endDay} from LLM response`);
    }

    return JSON.parse(jsonMatch[0]);
  }
}

// =============================================================================
// Background Generation Manager
// =============================================================================

export class CaseGenerationManager {
  private generator: CaseGenerator;
  private pendingGenerations = new Map<string, Promise<GeneratedCase>>();
  private generatedCases = new Map<string, GeneratedCase>();

  constructor(generator: CaseGenerator) {
    this.generator = generator;
  }

  /**
   * Called when player makes progress - triggers generation if needed
   */
  onPlayerProgress(
    playerId: string,
    currentCaseNumber: number,
    currentPoints: number,
    targetPoints: number
  ): void {
    const nextCaseNumber = currentCaseNumber + 1;
    const nextCaseKey = `case-${nextCaseNumber}`;

    // Check if we should generate
    const nextCaseExists = this.generatedCases.has(nextCaseKey) || this.pendingGenerations.has(nextCaseKey);

    if (this.generator.shouldTriggerGeneration(currentPoints, targetPoints, nextCaseExists)) {
      console.log(`[CaseManager] Player ${playerId} at ${currentPoints}/${targetPoints} - triggering Case ${nextCaseNumber} generation`);

      const generationPromise = this.generator.generateNextCase(nextCaseNumber);
      this.pendingGenerations.set(nextCaseKey, generationPromise);

      generationPromise.then(generated => {
        this.generatedCases.set(nextCaseKey, generated);
        this.pendingGenerations.delete(nextCaseKey);
        console.log(`[CaseManager] Case ${nextCaseNumber} ready for players`);
      }).catch(err => {
        console.error(`[CaseManager] Failed to generate Case ${nextCaseNumber}:`, err);
        this.pendingGenerations.delete(nextCaseKey);
      });
    }
  }

  /**
   * Get a generated case (or wait for it if being generated)
   */
  async getCase(caseNumber: number): Promise<GeneratedCase | null> {
    const caseKey = `case-${caseNumber}`;

    // Already generated
    if (this.generatedCases.has(caseKey)) {
      return this.generatedCases.get(caseKey)!;
    }

    // Being generated - wait for it
    if (this.pendingGenerations.has(caseKey)) {
      return this.pendingGenerations.get(caseKey)!;
    }

    // Not started - generate now
    try {
      const generated = await this.generator.generateNextCase(caseNumber);
      this.generatedCases.set(caseKey, generated);
      return generated;
    } catch (err) {
      console.error(`[CaseManager] Failed to generate Case ${caseNumber}:`, err);
      return null;
    }
  }
}

// =============================================================================
// Default World Context
// =============================================================================

export const WANDERERS_REST_CONTEXT = `
Wanderer's Rest is a tavern in a small town. It has a dark history.

The Black Sun is a shadowy organization that collects old debts - sometimes decades later.
They send hooded assassins. They leave black sun seals as warnings.

The tavern was recently inherited by the player after the previous owner, Harren, was murdered.
The player has been solving mysteries by finding lies among the regulars' statements.

Themes: secrets, debts, guilt, small-town dynamics, people protecting each other,
the past catching up with people, moral ambiguity.

Tone: Noir mystery, character-driven, dialogue-heavy, atmospheric.
`;
