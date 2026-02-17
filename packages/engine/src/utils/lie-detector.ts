/**
 * Lie Detector
 *
 * Cross-references NPC claims against known facts.
 * Generates "gut feeling" alerts when inconsistencies detected.
 */

import { LLMProvider } from '../llm/providers.js';
import { Fact, FactStore, Contradiction } from './fact-store.js';

export interface LieAlert {
  severity: 'suspicion' | 'inconsistency' | 'lie';
  npcName: string;
  claim: string;
  contradictedBy?: {
    source: string;
    claim: string;
  };
  gutFeeling: string;  // Narrative text for the player
}

const CONTRADICTION_CHECK_PROMPT = `You are analyzing potential contradictions in a detective game.

Compare these two claims and determine if they contradict each other:

CLAIM A (from {sourceA}): "{claimA}"
CLAIM B (from {sourceB}): "{claimB}"

Respond in JSON:
{
  "contradict": true/false,
  "severity": "none" | "minor" | "significant" | "direct",
  "explanation": "brief explanation of the contradiction or why they don't contradict"
}`;

const GUT_FEELING_PROMPT = `You are the player's gut instinct in a detective game set in a fantasy tavern.
Generate a brief, evocative "gut feeling" that alerts the player to a potential lie or inconsistency.

The NPC {npcName} just said: "{claim}"
But {contradictingSource} previously said: "{contradictingClaim}"

Write a 1-2 sentence gut feeling in second person. Be atmospheric and suggestive, not explicit.
Example style: "Something about her story doesn't sit right. Wasn't it Maren who said..."

Gut feeling:`;

export class LieDetector {
  constructor(
    private llm: LLMProvider,
    private factStore: FactStore
  ) {}

  /**
   * Check a new claim against known facts
   */
  async checkClaim(
    npcName: string,
    claim: string,
    subject: string
  ): Promise<{ alert: LieAlert | null; tokensUsed: number }> {
    // Get existing facts about this subject
    const existingFacts = this.factStore.getFactsAbout(subject);

    // Filter to facts from other sources
    const otherSourceFacts = existingFacts.filter(f =>
      !(f.source.type === 'npc' && f.source.name.toLowerCase() === npcName.toLowerCase())
    );

    if (otherSourceFacts.length === 0) {
      return { alert: null, tokensUsed: 0 };
    }

    // Check against each existing fact
    let totalTokens = 0;
    for (const existingFact of otherSourceFacts) {
      const result = await this.compareClaimsWithLLM(
        claim,
        npcName,
        existingFact.claim,
        this.formatSource(existingFact)
      );
      totalTokens += result.tokensUsed;

      if (result.contradict) {
        // Generate gut feeling alert
        const gutResult = await this.generateGutFeeling(
          npcName,
          claim,
          existingFact.claim,
          this.formatSource(existingFact)
        );
        totalTokens += gutResult.tokensUsed;

        return {
          alert: {
            severity: this.mapSeverity(result.severity),
            npcName,
            claim,
            contradictedBy: {
              source: this.formatSource(existingFact),
              claim: existingFact.claim,
            },
            gutFeeling: gutResult.feeling,
          },
          tokensUsed: totalTokens,
        };
      }
    }

    return { alert: null, tokensUsed: totalTokens };
  }

  /**
   * Use LLM to compare two claims
   */
  private async compareClaimsWithLLM(
    claimA: string,
    sourceA: string,
    claimB: string,
    sourceB: string
  ): Promise<{ contradict: boolean; severity: string; tokensUsed: number }> {
    const prompt = CONTRADICTION_CHECK_PROMPT
      .replace('{claimA}', claimA)
      .replace('{sourceA}', sourceA)
      .replace('{claimB}', claimB)
      .replace('{sourceB}', sourceB);

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { contradict: false, severity: 'none', tokensUsed: response.tokensUsed ?? 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        contradict: parsed.contradict === true,
        severity: parsed.severity || 'none',
        tokensUsed: response.tokensUsed ?? 0,
      };
    } catch {
      return { contradict: false, severity: 'none', tokensUsed: 0 };
    }
  }

  /**
   * Generate atmospheric gut feeling text
   */
  private async generateGutFeeling(
    npcName: string,
    claim: string,
    contradictingClaim: string,
    contradictingSource: string
  ): Promise<{ feeling: string; tokensUsed: number }> {
    const prompt = GUT_FEELING_PROMPT
      .replace('{npcName}', npcName)
      .replace('{claim}', claim)
      .replace('{contradictingSource}', contradictingSource)
      .replace('{contradictingClaim}', contradictingClaim);

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ]);

      return {
        feeling: response.content.trim(),
        tokensUsed: response.tokensUsed ?? 0,
      };
    } catch {
      // Fallback gut feeling
      return {
        feeling: `Something about what ${npcName} just said doesn't quite add up...`,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Format a fact source for display
   */
  private formatSource(fact: Fact): string {
    if (fact.source.type === 'npc') {
      return fact.source.name;
    }
    if (fact.source.type === 'player') {
      return 'you';
    }
    return fact.source.type;
  }

  /**
   * Map LLM severity to alert severity
   */
  private mapSeverity(severity: string): LieAlert['severity'] {
    switch (severity) {
      case 'direct':
        return 'lie';
      case 'significant':
        return 'inconsistency';
      default:
        return 'suspicion';
    }
  }

  /**
   * Generate a summary of all suspicious facts for the player
   */
  formatSuspicions(): string {
    const suspicious = this.factStore.getSuspiciousFacts();
    if (suspicious.length === 0) {
      return "Your gut tells you nothing seems off... yet.";
    }

    const lines = ["*Your Suspicions*\n"];

    // Group by subject
    const bySubject = new Map<string, Fact[]>();
    for (const fact of suspicious) {
      if (!bySubject.has(fact.subject)) {
        bySubject.set(fact.subject, []);
      }
      bySubject.get(fact.subject)!.push(fact);
    }

    for (const [subject, facts] of bySubject) {
      lines.push(`\n_About ${subject}:_`);
      for (const fact of facts) {
        const icon = fact.status === 'contradicted' ? '⚠️' : '❓';
        lines.push(`${icon} ${fact.source.name} said: "${fact.claim}"`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Simple heuristic contradiction check (no LLM)
 * For quick checks when we don't want to spend tokens
 */
export function quickContradictionCheck(claimA: string, claimB: string): boolean {
  const a = claimA.toLowerCase();
  const b = claimB.toLowerCase();

  // Direct negation patterns
  const negationPairs = [
    ['never', 'always'],
    ['no one', 'everyone'],
    ["didn't", 'did'],
    ["wasn't", 'was'],
    ["isn't", 'is'],
    ['dead', 'alive'],
    ['innocent', 'guilty'],
    ['friend', 'enemy'],
    ['trust', 'betray'],
    ['accident', 'murder'],
    ['truth', 'lie'],
  ];

  for (const [neg1, neg2] of negationPairs) {
    const hasNeg1A = a.includes(neg1);
    const hasNeg2A = a.includes(neg2);
    const hasNeg1B = b.includes(neg1);
    const hasNeg2B = b.includes(neg2);

    if ((hasNeg1A && hasNeg2B) || (hasNeg2A && hasNeg1B)) {
      return true;
    }
  }

  return false;
}
