/**
 * Assertion Extractor
 *
 * Uses LLM to extract factual claims from conversations.
 * Identifies who said what about whom.
 */

import { LLMProvider } from '../llm/providers.js';
import { FactSource } from './fact-store.js';

export interface ExtractedAssertion {
  subject: string;      // Who/what is this about
  claim: string;        // The factual claim
  speaker: string;      // Who made this claim
  confidence: number;   // How confident the extraction is (0-1)
  isAboutSelf: boolean; // Is the speaker talking about themselves
}

const EXTRACTION_PROMPT = `You are a fact extractor for a detective game. Analyze this conversation and extract factual claims.

For each claim, identify:
1. SUBJECT: Who/what the claim is about (use lowercase: "kira", "maren", "player", "tavern", "previous_owner", etc.)
2. CLAIM: The actual factual statement (brief, factual phrasing)
3. SPEAKER: Who made this claim ("player" or the NPC name)
4. CONFIDENCE: How certain this claim seems (0.0-1.0)
5. IS_ABOUT_SELF: Is the speaker talking about themselves? (true/false)

Extract claims about:
- Personal history ("I came from the capital")
- Relationships ("Maren doesn't trust strangers")
- Events ("The previous owner died last month")
- Character traits ("Kira is secretive")
- Locations/times ("The cellar is locked at night")
- Opinions presented as facts ("The death wasn't an accident")

DO NOT extract:
- Greetings or pleasantries
- Vague statements
- Questions
- Pure opinions without factual content

Respond in JSON format:
{
  "assertions": [
    {
      "subject": "string",
      "claim": "string",
      "speaker": "string",
      "confidence": number,
      "isAboutSelf": boolean
    }
  ]
}

If no factual claims found, return: {"assertions": []}`;

export class AssertionExtractor {
  constructor(private llm: LLMProvider) {}

  async extract(
    conversation: Array<{ role: 'player' | 'npc'; content: string }>,
    npcName: string,
    day: number
  ): Promise<{ assertions: ExtractedAssertion[]; tokensUsed: number }> {
    // Format conversation for the prompt
    const convoText = conversation
      .slice(-6) // Last 6 messages for context
      .map(m => `${m.role === 'player' ? 'Player' : npcName}: ${m.content}`)
      .join('\n');

    const prompt = `${EXTRACTION_PROMPT}

CONVERSATION:
${convoText}

Extract all factual claims from this conversation:`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ]);

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { assertions: [], tokensUsed: response.tokensUsed ?? 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const assertions: ExtractedAssertion[] = (parsed.assertions || []).map((a: any) => ({
        subject: a.subject?.toLowerCase() || 'unknown',
        claim: a.claim || '',
        speaker: a.speaker?.toLowerCase() || 'unknown',
        confidence: typeof a.confidence === 'number' ? a.confidence : 0.5,
        isAboutSelf: a.isAboutSelf === true,
      }));

      return {
        assertions: assertions.filter(a => a.claim.length > 0),
        tokensUsed: response.tokensUsed ?? 0,
      };
    } catch (error) {
      console.error('Assertion extraction failed:', error);
      return { assertions: [], tokensUsed: 0 };
    }
  }

  /**
   * Convert extracted assertions to fact sources
   */
  toFactSources(
    assertions: ExtractedAssertion[],
    npcName: string,
    day: number
  ): Array<{ subject: string; claim: string; source: FactSource }> {
    return assertions.map(a => ({
      subject: a.subject,
      claim: a.claim,
      source: {
        type: a.speaker === 'player' ? 'player' : 'npc',
        name: a.speaker === 'player' ? 'player' : npcName,
        day,
        context: a.isAboutSelf ? 'self-claim' : undefined,
      } as FactSource,
    }));
  }
}

/**
 * Quick extraction for detecting lies in real-time
 * Simpler prompt, faster response
 */
export async function quickExtractClaims(
  llm: LLMProvider,
  npcMessage: string,
  npcName: string
): Promise<{ claims: string[]; tokensUsed: number }> {
  const prompt = `Extract any factual claims from this NPC dialogue. Return as JSON array of strings.
If no claims, return [].

NPC (${npcName}): "${npcMessage}"

Claims:`;

  try {
    const response = await llm.generate([
      { role: 'user', content: prompt }
    ]);

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { claims: [], tokensUsed: response.tokensUsed ?? 0 };
    }

    const claims = JSON.parse(jsonMatch[0]);
    return {
      claims: Array.isArray(claims) ? claims : [],
      tokensUsed: response.tokensUsed ?? 0,
    };
  } catch {
    return { claims: [], tokensUsed: 0 };
  }
}
