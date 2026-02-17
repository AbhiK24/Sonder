/**
 * Case Generator
 *
 * Generates procedural cases after FTUE period (day 8+).
 * - Daily minor cases
 * - Weekly medium/major cases
 */

import { LLMProvider } from '../llm/providers.js';
import { Case, Clue, Suspect, CaseSeverity, CASE_TEMPLATES } from './types.js';

interface GeneratorContext {
  day: number;
  activeNPCs: string[];           // Available NPCs to involve
  recentCaseTypes: string[];      // Avoid repetition
  townName?: string;
}

const CASE_GENERATION_PROMPT = `You are generating a mystery case for a fantasy tavern detective game.

CONTEXT:
Day: {day}
Available NPCs: {npcs}
Avoid these recent case types: {recentTypes}

Generate a {severity} case with:
- A compelling hook (1-2 sentences, atmospheric)
- A victim or situation
- {suspectCount} suspects from the available NPCs
- {clueCount} clues that can be discovered
- One clear solution

Respond in JSON:
{
  "title": "Case title",
  "hook": "How the player learns of this",
  "description": "Full description",
  "type": "theft|dispute|rumor|assault|threat|disappearance",
  "victim": "NPC id or description",
  "suspects": [
    {
      "npcId": "id",
      "motive": "why they might have done it",
      "alibi": "their story",
      "isGuilty": true/false
    }
  ],
  "clues": [
    {
      "content": "what this clue reveals",
      "source": "npc id or location",
      "pointsTo": "suspect id or 'truth' or 'red_herring'"
    }
  ],
  "solution": "What actually happened"
}`;

export class CaseGenerator {
  constructor(private llm: LLMProvider) {}

  /**
   * Should we generate a case today?
   */
  shouldGenerateCase(day: number, lastCaseDay: number, activeCases: number): {
    generate: boolean;
    severity: CaseSeverity;
  } {
    // FTUE period - no procedural cases
    if (day <= 7) {
      return { generate: false, severity: 'minor' };
    }

    // Don't overwhelm with cases
    if (activeCases >= 3) {
      return { generate: false, severity: 'minor' };
    }

    // Major case every 7 days (after FTUE)
    if ((day - 7) % 7 === 0) {
      return { generate: true, severity: 'major' };
    }

    // Medium case every 3 days
    if ((day - 7) % 3 === 0) {
      return { generate: true, severity: 'medium' };
    }

    // Minor case daily (50% chance to avoid fatigue)
    if (Math.random() > 0.5) {
      return { generate: true, severity: 'minor' };
    }

    return { generate: false, severity: 'minor' };
  }

  /**
   * Generate a new case using LLM
   */
  async generateCase(
    severity: CaseSeverity,
    context: GeneratorContext
  ): Promise<{ case: Case | null; tokensUsed: number }> {
    const template = CASE_TEMPLATES[severity];
    const scenario = template.scenarios[Math.floor(Math.random() * template.scenarios.length)];

    const prompt = CASE_GENERATION_PROMPT
      .replace('{day}', context.day.toString())
      .replace('{npcs}', context.activeNPCs.join(', '))
      .replace('{recentTypes}', context.recentCaseTypes.join(', ') || 'none')
      .replace('{severity}', severity)
      .replace('{suspectCount}', scenario.suspectCount.toString())
      .replace('{clueCount}', scenario.clueCount.toString());

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { case: null, tokensUsed: response.tokensUsed ?? 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const caseId = `case_${context.day}_${Date.now().toString(36)}`;

      const newCase: Case = {
        id: caseId,
        title: parsed.title || 'Untitled Case',
        hook: parsed.hook || 'Something has happened.',
        description: parsed.description || '',
        severity,
        status: 'hidden',
        availableDay: context.day,
        expiresDay: severity === 'minor' ? context.day + 3 : undefined,

        victim: parsed.victim,
        suspects: (parsed.suspects || []).map((s: any, i: number) => ({
          npcId: s.npcId || `suspect_${i}`,
          motive: s.motive || 'Unknown motive',
          alibi: s.alibi || 'No alibi given',
          isGuilty: s.isGuilty === true,
          suspicionLevel: 0,
        })),
        clues: (parsed.clues || []).map((c: any, i: number) => ({
          id: `${caseId}_clue_${i}`,
          content: c.content || '',
          source: c.source || 'unknown',
          revealCondition: { type: 'ask' as const, value: c.source },
          revealed: false,
          pointsTo: c.pointsTo || 'truth',
        })),
        solution: parsed.solution || 'The truth remains hidden.',

        revealedClues: [],
        dayStarted: context.day,
      };

      return { case: newCase, tokensUsed: response.tokensUsed ?? 0 };
    } catch (error) {
      console.error('Case generation failed:', error);
      return { case: null, tokensUsed: 0 };
    }
  }

  /**
   * Generate a simple case without LLM (fallback)
   */
  generateSimpleCase(severity: CaseSeverity, context: GeneratorContext): Case {
    const template = CASE_TEMPLATES[severity];
    const scenario = template.scenarios[Math.floor(Math.random() * template.scenarios.length)];

    const caseId = `case_${context.day}_${Date.now().toString(36)}`;

    // Simple templates
    const simpleCases = {
      missing_item: {
        title: 'The Missing Coin Purse',
        hook: 'A traveler claims their coin purse was stolen during the night.',
        description: 'Someone at the tavern is a thief. The traveler is certain.',
        solution: 'It fell behind the bed. No theft occurred.',
      },
      accusation: {
        title: 'The Bitter Accusation',
        hook: 'Two locals are arguing loudly. One accuses the other of cheating.',
        description: 'A card game went wrong. Or did something else happen?',
        solution: 'A misunderstanding over game rules, nothing more.',
      },
      rumor: {
        title: 'Whispers in the Dark',
        hook: 'Strange rumors are spreading about sounds from the cellar.',
        description: 'People talk of noises at night. Probably rats. Probably.',
        solution: 'A stray cat got in through a crack.',
      },
      theft: {
        title: 'The Merchant\'s Loss',
        hook: 'A merchant wakes to find goods missing from their cart.',
        description: 'Someone knew exactly what to take. This was planned.',
        solution: 'A desperate local took it to pay debts. They\'ll confess if pressed.',
      },
      dispute: {
        title: 'The Old Grudge',
        hook: 'Two old friends aren\'t speaking. The tavern feels the tension.',
        description: 'Something happened between them. Something recent.',
        solution: 'One borrowed money and forgot. Pride keeps them silent.',
      },
    };

    const caseData = simpleCases[scenario.type as keyof typeof simpleCases] || simpleCases.rumor;

    // Pick random suspects from available NPCs
    const shuffledNPCs = [...context.activeNPCs].sort(() => Math.random() - 0.5);
    const suspects: Suspect[] = shuffledNPCs.slice(0, scenario.suspectCount).map((npcId, i) => ({
      npcId,
      motive: 'They were nearby when it happened.',
      alibi: 'They claim they were elsewhere.',
      isGuilty: i === 0, // First one is guilty for simple cases
      suspicionLevel: 0,
    }));

    const clues: Clue[] = [
      {
        id: `${caseId}_clue_0`,
        content: 'Someone saw movement near the scene.',
        source: shuffledNPCs[0] || 'maren',
        revealCondition: { type: 'ask', value: 'scene' },
        revealed: false,
        pointsTo: suspects[0]?.npcId || 'truth',
      },
      {
        id: `${caseId}_clue_1`,
        content: 'A witness heard arguing earlier.',
        source: 'maren',
        revealCondition: { type: 'trust', value: 40 },
        revealed: false,
        pointsTo: 'truth',
      },
    ];

    return {
      id: caseId,
      title: caseData.title,
      hook: caseData.hook,
      description: caseData.description,
      severity,
      status: 'hidden',
      availableDay: context.day,
      expiresDay: severity === 'minor' ? context.day + 3 : undefined,

      suspects,
      clues,
      solution: caseData.solution,

      revealedClues: [],
      dayStarted: context.day,
    };
  }
}

/**
 * Case Manager - tracks all cases for a player
 */
export class CaseManager {
  private cases: Map<string, Case> = new Map();
  private ftueComplete: boolean = false;
  private lastCaseDay: number = 0;

  constructor(
    private generator: CaseGenerator,
    initialCases?: Case[]
  ) {
    if (initialCases) {
      for (const c of initialCases) {
        this.cases.set(c.id, c);
      }
    }
  }

  addCase(c: Case): void {
    this.cases.set(c.id, c);
  }

  getCase(id: string): Case | undefined {
    return this.cases.get(id);
  }

  getActiveCases(): Case[] {
    return [...this.cases.values()].filter(c => c.status === 'active');
  }

  getAllCases(): Case[] {
    return [...this.cases.values()];
  }

  /**
   * Called during world tick to potentially spawn new cases
   */
  async onDayChange(
    day: number,
    activeNPCs: string[]
  ): Promise<{ newCase: Case | null; tokensUsed: number }> {
    // Check if FTUE is complete
    if (day > 7) {
      this.ftueComplete = true;
    }

    const activeCases = this.getActiveCases().length;
    const { generate, severity } = this.generator.shouldGenerateCase(
      day,
      this.lastCaseDay,
      activeCases
    );

    if (!generate) {
      return { newCase: null, tokensUsed: 0 };
    }

    // Get recent case types to avoid repetition
    const recentCaseTypes = [...this.cases.values()]
      .filter(c => c.dayStarted && c.dayStarted > day - 7)
      .map(c => c.title.split(' ')[1]?.toLowerCase() || 'unknown');

    const { case: newCase, tokensUsed } = await this.generator.generateCase(severity, {
      day,
      activeNPCs,
      recentCaseTypes,
    });

    if (newCase) {
      this.addCase(newCase);
      this.lastCaseDay = day;
    }

    return { newCase, tokensUsed };
  }

  /**
   * Reveal a clue to the player
   */
  revealClue(caseId: string, clueId: string): boolean {
    const c = this.cases.get(caseId);
    if (!c) return false;

    const clue = c.clues.find(cl => cl.id === clueId);
    if (!clue || clue.revealed) return false;

    clue.revealed = true;
    c.revealedClues.push(clueId);

    // Update suspicion levels
    if (clue.pointsTo !== 'truth' && clue.pointsTo !== 'red_herring') {
      const suspect = c.suspects.find(s => s.npcId === clue.pointsTo);
      if (suspect) {
        suspect.suspicionLevel = Math.min(100, suspect.suspicionLevel + 20);
      }
    }

    return true;
  }

  /**
   * Check if case should transition status
   */
  checkCaseStatus(caseId: string, currentDay: number): void {
    const c = this.cases.get(caseId);
    if (!c) return;

    // Activate hidden cases
    if (c.status === 'hidden' && c.availableDay <= currentDay) {
      c.status = 'active';
    }

    // Expire old minor cases
    if (c.status === 'active' && c.expiresDay && currentDay > c.expiresDay) {
      c.status = 'cold';
    }
  }

  /**
   * Serialize for persistence
   */
  serialize(): object {
    return {
      cases: [...this.cases.values()],
      ftueComplete: this.ftueComplete,
      lastCaseDay: this.lastCaseDay,
    };
  }

  /**
   * Deserialize from persistence
   */
  static deserialize(data: any, generator: CaseGenerator): CaseManager {
    const manager = new CaseManager(generator, data?.cases || []);
    manager.ftueComplete = data?.ftueComplete || false;
    manager.lastCaseDay = data?.lastCaseDay || 0;
    return manager;
  }
}
