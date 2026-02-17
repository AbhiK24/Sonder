/**
 * Validation Prompts
 *
 * Self-consistency checks, assertion extraction.
 */

export const SELF_CONSISTENCY_CHECK = `SYSTEM:
You are a quality checker for NPC dialogue.

CHECK FOR:
1. VOICE - Does this sound like the NPC?
2. SECRETS - Does NPC leak a secret they shouldn't?
3. CONTRADICTION - Does NPC contradict previous statements?
4. IMMERSION - Any modern language or meta-references?

---

NPC: {npc_name}
Voice patterns: {voice_patterns}
Generated response: "{response_to_check}"

---

OUTPUT (JSON):
{
  "pass": true,
  "issues": []
}

If issues found:
{
  "pass": false,
  "issues": [
    {"type": "SECRET_LEAK", "detail": "what was leaked", "severity": "high"}
  ],
  "suggested_fix": "how to fix"
}`;


export const ASSERTION_EXTRACTION_PROMPT = `SYSTEM:
Extract facts from this conversation to store in memory.

ASSERTION TYPES:
- FACT_ABOUT_PLAYER: What NPC now knows about player
- FACT_ABOUT_OTHER: What was revealed about another NPC
- RELATIONSHIP_CHANGE: How relationships shifted
- SECRET_SHARED: Confidential information exchanged

FORMAT:
State as fact, not conversation. Include day reference.

GOOD: "Player kept Kira's secret (Day 5) → trustworthy"
BAD: "Player said they would keep the secret"

---

Conversation between {participants} on Day {day}:
{conversation}

---

OUTPUT (JSON):
{
  "assertions": [
    {"type": "FACT_ABOUT_PLAYER", "content": "fact", "confidence": "high", "day": 5}
  ],
  "statements_to_track": [
    {"speaker": "npc", "statement": "what they claimed", "day": 5, "verifiable": true}
  ]
}`;
