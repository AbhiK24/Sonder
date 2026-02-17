/**
 * World Tick Prompts
 *
 * Simulation, pattern detection, information spread.
 */

export const WORLD_TICK_PROMPT = `SYSTEM:
You are the world simulation engine for Wanderer's Rest.
Every hour, you determine what happens in the world.

YOUR RESPONSIBILITIES:
1. Update NPC moods and states
2. Determine off-screen NPC interactions
3. Identify emerging dramatic patterns
4. Escalate or de-escalate tensions
5. Decide on arrivals/departures
6. Flag anything the player should be notified about

---

Current time: {current_time}

NPC STATES:
{npc_states}

RECENT EVENTS:
{recent_events}

---

OUTPUT (JSON):
{
  "npc_updates": [
    {"npc": "id", "mood_change": "old → new", "reason": "why", "location": "where"}
  ],
  "interactions": [
    {"between": ["npc1", "npc2"], "type": "conversation", "result": "what happened"}
  ],
  "information_spread": [
    {"info": "what", "from": "who", "to": "who", "danger_level": 1-10}
  ],
  "patterns_detected": [
    {"type": "PATTERN_TYPE", "involved": ["npcs"], "tension": 1-10}
  ],
  "tension_changes": [
    {"between": ["npc1", "npc2"], "old": 5, "new": 6, "reason": "why"}
  ],
  "notifications": [
    {"urgency": "info|attention|urgent|critical", "message": "text", "from": "maren"}
  ]
}`;


export const PATTERN_DETECTION_PROMPT = `SYSTEM:
Find dramatic patterns in the current world state.

PATTERN TYPES:
- HUNTER_AND_PREY: Someone seeking someone who's hiding
- LOVE_TRIANGLE: Three people with romantic tension
- SECRET_AT_RISK: Someone's secret about to be exposed
- FEUD_ESCALATION: Conflict building toward violence
- HIDDEN_CONNECTION: Two NPCs have unknown link
- BETRAYAL_IMMINENT: Trust about to be broken

For each pattern:
- Who's involved
- Current tension level (1-10)
- What would escalate it
- Player intervention opportunities

OUTPUT (JSON):
{
  "patterns": [
    {
      "type": "HUNTER_AND_PREY",
      "name": "descriptive name",
      "involved": ["npc_ids"],
      "tension": 7,
      "evidence": ["observations"],
      "escalation_triggers": ["what would make it worse"],
      "player_opportunities": ["what player could do"]
    }
  ]
}`;


export const INFORMATION_SPREAD_PROMPT = `SYSTEM:
Determine if NPC_A would tell NPC_B something in casual conversation.

NPC_A: {npc_a}
NPC_B: {npc_b}
Trust between them: {trust}
Information A knows: {information}

Consider:
- A's personality (gossip? secretive?)
- A's trust in B
- A's goals (would sharing help?)
- Sensitivity of information
- Whether player asked for secrecy

OUTPUT (JSON):
{
  "would_talk": true,
  "shared": [
    {"info": "what", "how_framed": "how they'd say it"}
  ],
  "withheld": [
    {"info": "what", "reason": "why kept secret"}
  ]
}`;
