# Wanderer's Rest - Game Design Overhaul

---

## The Thesis

**Local-first AI game engine where players own their data.**

### Core Principles:

1. **Local-first** - Runs on player's machine, their data, their world
2. **AI-native** - Maximize AI in all aspects (generation, NPCs, events, adaptation)
3. **Game design still matters** - AI doesn't excuse bad loops. Structure must be solid.

### What This Means:

```
AI handles: Content, dialogue, adaptation, surprise
Design handles: Stakes, loops, progression, goals

AI without design = Interesting but aimless
Design without AI = Structured but lifeless
Both together = Addictive + Alive
```

### The Balance:

| Aspect | AI's Job | Design's Job |
|--------|----------|--------------|
| NPCs | Generate personality, dialogue | Define goals, secrets, relationships |
| Mystery | Generate clues, red herrings | Define structure, solution, timeline |
| Events | Generate daily happenings | Define triggers, consequences, pacing |
| Player | Adapt to player's style | Define stakes, rewards, fail states |

**AI is the content engine. Design is the game engine.**

---

## The Question

**How do we make this addictive?**

Not "how do we add features" - how do we create a loop that players can't stop.

---

## Part 1: Why It's Not Addictive Now

### The Current Loop (Broken)

```
Player opens Telegram
    ↓
Player messages NPC
    ↓
NPC responds with info
    ↓
Player... messages again?
    ↓
Eventually closes Telegram
    ↓
No reason to return
```

**Problems:**
1. Player initiates everything - no pull
2. No stakes - nothing to lose
3. No goals - just "talk to people"
4. No rhythm - no daily hook
5. No progression feeling - numbers go up invisibly
6. No tension - NPCs are helpful, not challenging

### What's Missing: The Hook

Every addictive game has a **hook** - the thing that pulls you back.

| Game | Hook |
|------|------|
| Wordle | "One puzzle per day. Did I get it?" |
| Candy Crush | "Just one more level" |
| Stardew Valley | "Let me just finish this day" |
| Her Story | "What does the next clip reveal?" |
| Poker | "This hand could change everything" |

**Wanderer's Rest hook:** ???

We don't have one.

---

## Part 2: Designing the Addictive Loop

### The Core Loop (What We Need)

```
TENSION
   ↓
Something is at stake. Clock is ticking.
   ↓
DECISION
   ↓
Player must choose. Choices have cost.
   ↓
CONSEQUENCE
   ↓
World reacts. Things change visibly.
   ↓
DISCOVERY
   ↓
New information. Dopamine hit.
   ↓
NEW TENSION
   ↓
Stakes raised. Loop repeats.
```

### The Hook Candidates

**Option A: Daily Mystery**
- Each day, one new piece of information arrives
- Miss a day? It's gone forever (or harder to get)
- "I need to check what happened today"

**Option B: Countdown Pressure**
- 14 days to solve the mystery
- Day 7: Evidence starts disappearing
- Day 10: Witnesses leave town
- Day 14: Case closed forever
- "I'm running out of time"

**Option C: Social Simulation**
- NPCs talk to EACH OTHER while you're gone
- Your reputation spreads
- Alliances form without you
- "What did they say about me?"

**Option D: Accusation Stakes**
- You can accuse someone at any time
- Wrong accusation = massive trust loss + consequences
- Right accusation = case solved
- "Am I sure enough to risk it?"

**Option E: NPC Proactivity**
- NPCs message YOU
- "Maren: Come to the tavern. Now."
- Ignore them? Relationship suffers
- "What do they want?"

### Recommended: Combine C + D + E

**The New Loop:**

```
Morning: NPC messages you with something
   ↓
You investigate, talk to people
   ↓
Your words spread (visible consequences)
   ↓
Evening: World tick - NPCs react to your day
   ↓
Night: You decide - accuse someone? Wait?
   ↓
Next morning: New information based on yesterday
   ↓
Repeat until accusation or day 14
```

---

## Part 3: The New Game Structure

### Daily Rhythm

```
MORNING (Real: 6am-12pm)
├── Push notification from an NPC
├── "Something happened" or "I remembered something"
└── Creates reason to open the game

AFTERNOON (Real: 12pm-6pm)
├── Player investigates
├── Talks to NPCs
├── Makes choices
└── Words spread in real-time

EVENING (Real: 6pm-10pm)
├── NPCs react to your day
├── Gossip spreads
├── Consequences manifest
└── New clues may surface

NIGHT (Real: 10pm-6am)
├── World tick runs
├── NPCs interact with each other
├── Events happen off-screen
└── Tomorrow's content generated
```

### The 14-Day Case Structure

```
DAYS 1-3: SETUP
├── Meet core NPCs
├── Learn basic facts
├── Establish relationships
└── No pressure yet

DAYS 4-7: INVESTIGATION
├── Clues start revealing
├── Contradictions surface
├── First deadline warning (Day 7)
└── "The hooded figure was seen again"

DAYS 8-11: PRESSURE
├── Evidence disappearing
├── NPCs getting nervous
├── Alliances forming
├── Stakes rising
└── "Thom is pushing to close the case"

DAYS 12-14: CLIMAX
├── Must make accusation
├── Final clues available
├── NPCs take sides
├── Confrontation possible
└── "Last chance. Who did it?"

DAY 14+: RESOLUTION
├── Accusation results play out
├── Truth revealed (if solved)
├── Consequences stick
└── New mysteries begin (if subscribed)
```

### The Accusation System

**At any point, player can ACCUSE someone:**

```
ACCUSE ALDRIC

⚠️ THIS IS A FORMAL ACCUSATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are accusing Aldric of murdering Harren.

If you're RIGHT:
  → Case solved
  → Major trust gain with honest NPCs
  → Story progresses

If you're WRONG:
  → Accused NPC becomes hostile
  → Trust loss with everyone (-20)
  → Real killer becomes harder to catch
  → You look foolish

Your evidence against Aldric:
  • He lied about being at the forge
  • He was owed money
  • [No direct evidence of murder]

Confidence: LOW

Are you sure? Type CONFIRM ACCUSATION or CANCEL
```

**This creates STAKES.** Every conversation is building toward this moment.

### The Reputation System

**Your words spread. NPCs talk.**

```
REPUTATION STATES:
━━━━━━━━━━━━━━━━━━
Newcomer → Curious → Investigator → Trusted → Dangerous

OR

Newcomer → Nosy → Suspicious → Threatening → Outcast
```

**How it works:**
- Tell Kira a secret? Maren knows by evening.
- Accuse someone wrongly? Everyone hears.
- Help someone? Others notice.
- Ignore an NPC? They feel it.

**Visible in game:**
```
[Your reputation shifted]
Maren sees you as: Investigator (was: Curious)
Aldric sees you as: Threatening (was: Suspicious)
```

### The Gossip Network

**NPCs share information with each other:**

```
GOSSIP RULES:
━━━━━━━━━━━━
Maren ←→ Kira (close, share everything)
Aldric ←→ Thom (drinking buddies)
Elena ←→ Maren (professional respect)
Thom ←→ Everyone (he's the guard captain)

WHAT SPREADS:
• What you asked about
• Who you accused
• What you seemed interested in
• How you treated people
```

**Player sees this:**
```
[Evening Report]
━━━━━━━━━━━━━━━
Word spread today:

• Kira told Maren you asked about the forge
• Aldric heard you're "asking too many questions"
• Thom is now watching you more carefully

Tomorrow, expect:
• Maren may bring up the forge
• Aldric will be more guarded
• Thom might visit the tavern
```

---

## Part 4: What Needs to Change

### MAJOR CHANGES (Architecture)

| Change | Current | New | Effort |
|--------|---------|-----|--------|
| Message Direction | Player → NPC | Bidirectional | HIGH |
| Time System | Passive world tick | Active daily rhythm | HIGH |
| Consequence System | None | Gossip network | MEDIUM |
| Goal System | Vague | Clear accusation target | MEDIUM |
| Stakes | None | Wrong accusation = penalty | LOW |
| Progression | Hidden trust | Visible reputation | LOW |

### FEATURE LIST

**Phase 1: Stakes & Goals**
- [ ] Accusation system (ACCUSE command)
- [ ] Wrong accusation consequences
- [ ] Day counter visible (Day 5 of 14)
- [ ] Case deadline with real consequences
- [ ] End state when case closes

**Phase 2: Proactive World**
- [ ] NPC sends first message (morning hook)
- [ ] Scheduled daily events
- [ ] Evening consequence report
- [ ] Night world tick (already exists, enhance)
- [ ] Push notifications (Telegram)

**Phase 3: Social Dynamics**
- [ ] Gossip network (who talks to whom)
- [ ] Information spreading mechanics
- [ ] Reputation system (visible)
- [ ] NPC reactions to reputation
- [ ] Relationship web visualization

**Phase 4: Discovery & Reward**
- [ ] Clue connection system (player links clues)
- [ ] "Aha!" moment notifications
- [ ] Evidence board (mental model)
- [ ] Theory system (player states theory, game tracks)
- [ ] Smart/dumb action feedback

**Phase 5: Polish & Depth**
- [ ] Multiple endings based on accusation
- [ ] Post-case content (new mysteries)
- [ ] NPC memory of past cases
- [ ] Procedural case generation
- [ ] Achievement system

---

## Part 5: The Minimum Viable Addiction

**If we could only ship 3 things, what creates addiction?**

### MVP Addiction Features:

1. **Morning NPC Message**
   - One notification per day
   - NPC has something to tell you
   - Creates "what happened?" pull

2. **14-Day Deadline + Accusation**
   - Clear goal: find the killer
   - Clear mechanic: ACCUSE someone
   - Clear stakes: wrong = consequences

3. **Evening Consequence Report**
   - Show what spread today
   - Show how NPCs reacted
   - Create anticipation for tomorrow

**That's it.** These three things create:
- Daily hook (morning message)
- Stakes (accusation risk)
- Feedback loop (evening report)

---

## Part 6: Open Design Questions

### Questions We Need to Answer

1. **How hard should the mystery be?**
   - Too easy = boring, solved in 3 days
   - Too hard = frustrating, never solved
   - Goldilocks = solvable by day 10-12 if paying attention

2. **What happens if player ignores the game?**
   - Option A: Case goes cold, game over
   - Option B: NPCs get frustrated, harder to solve
   - Option C: Time pauses (breaks immersion)

3. **How often should NPCs message?**
   - Too much = annoying, muted
   - Too little = forgotten
   - Sweet spot = 1-2 per day?

4. **Can player "lose" the game?**
   - Option A: Yes, wrong accusation = fail state
   - Option B: No fail, but bad ending
   - Option C: Can retry with penalties

5. **What comes after the first mystery?**
   - New mystery, same NPCs
   - NPCs remember your choices
   - Consequences carry forward
   - Or: Game ends, replay with different path

6. **How do we handle multiple timezones?**
   - Real time (morning for who?)
   - Player-relative time
   - Game-world time (disconnected from real)

7. **Should NPCs lie to the player?**
   - Currently: Yes, we track lies
   - But: Are we making it FEEL like they're lying?
   - Player should CATCH them, not be told

---

## Part 7: Inspiration Analysis

### What Works in Similar Games

**Her Story**
- You search, you discover
- No hand-holding
- "Aha!" moments are self-generated
- Ending is self-determined ("I think I understand")

**Return of the Obra Dinn**
- Logic puzzle: match facts to people
- Confirmation only when you're right
- Patience rewarded
- Massive "got it!" dopamine

**Disco Elysium**
- Failing is interesting
- Internal voices comment
- Reputation matters
- World reacts to you

**Stardew Valley**
- Daily rhythm is sacred
- "One more day" loop
- Relationships build slowly
- Events surprise you

**Wordle**
- Once per day
- High stakes (one chance)
- Social sharing
- Simple, deep

### What We Should Steal

| From | Steal |
|------|-------|
| Her Story | Self-directed discovery |
| Obra Dinn | Confirmation on correct deduction |
| Disco Elysium | Failing is interesting, internal voice |
| Stardew | Daily rhythm, relationship building |
| Wordle | Once-per-day stakes, simplicity |

---

## Part 8: Next Steps

### Immediate (Planning)
1. Decide on core loop (which option?)
2. Define MVP features (3 things)
3. Map out 14-day content calendar
4. Design accusation UX

### Short-term (Building)
1. Implement morning message system
2. Add accusation command
3. Add day counter and deadline
4. Create evening report

### Medium-term (Polish)
1. Gossip network
2. Reputation system
3. Multiple endings
4. Discovery notifications

### Long-term (Expansion)
1. New mysteries
2. New NPCs
3. Procedural generation
4. Other "souls" (new settings)

---

## Decision Log

| Question | Decision | Rationale | Date |
|----------|----------|-----------|------|
| Core loop? | **Mystery + Daily Ritual** | Chat exploration doesn't work. Need tangible goals. | 2024-02-18 |
| Game Type? | **NOT a chat toy** | Endless conversation gets old. Need stakes. | 2024-02-18 |
| Fail state? | TBD | | |
| Message frequency? | TBD | | |
| Timeline? | TBD | | |

---

## CONFIRMED DIRECTION

### What This Game IS:
- **Mystery Game** - Tangible case to solve, real answer, player feels smart
- **Daily Ritual** - New info each day, reason to return, FOMO if you miss

### What This Game is NOT:
- ~~Chat Toy~~ - Endless NPC conversation with no goal
- ~~Life Sim~~ - Too much content needed, not our strength
- ~~Open World~~ - Unfocused, no stakes

### The Loop We're Building:

```
DAILY HOOK
   ↓
New clue/event arrives (morning message)
   ↓
INVESTIGATION
   ↓
Talk to NPCs, connect dots
   ↓
STAKES
   ↓
Can accuse anytime - wrong = consequences
   ↓
CONSEQUENCE
   ↓
Your words spread, world reacts (evening)
   ↓
PROGRESS
   ↓
Day advances, deadline approaches
   ↓
Repeat until solved or Day 14
```

### Core Mechanics Confirmed:
1. **14-day mystery** with real deadline
2. **Daily new information** (hook to return)
3. **Accusation system** with stakes
4. **Consequences visible** (your words spread)
5. **"Aha!" moments** when player connects clues

### What We're Killing:
- Aimless chatting with no purpose
- Hidden progression (trust goes up invisibly)
- Passive player (NPCs only respond)
- No-stakes conversation (nothing to lose)

---

## THE FIVE RULES (Skeleton for AI to hang content on)

These are HARDCODED. AI generates content within these constraints.

---

### 1. WIN CONDITION - What does "solved" mean?

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Correct Accusation** | Player accuses the right person with enough evidence | Clear, satisfying | Binary, one moment |
| **B: Truth Uncovered** | Player discovers what happened (even without accusation) | More nuanced | Harder to measure |
| **C: Case Closed** | Accumulate enough evidence to "close" the case | Progressive | Less dramatic |
| **D: Confession Obtained** | Get the guilty party to confess | Most satisfying | Hard to design |

**Suggested: A + D Combined**
- Player must ACCUSE someone
- If correct + enough evidence → confrontation scene
- Guilty party confesses or is caught
- Clear victory moment

**Victory Tiers:**
```
PERFECT: Accused correctly + all clues found + confession obtained
GOOD: Accused correctly + most clues found
PARTIAL: Accused correctly but missing key evidence
HOLLOW: Accused correctly by luck, don't understand why
```

---

### 2. LOSE CONDITION - What does "failed" mean?

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Wrong Accusation** | Accuse innocent person | Clear stakes | Harsh, one mistake = done |
| **B: Time Runs Out** | Day 14 passes, case goes cold | Creates urgency | Feels arbitrary |
| **C: Trust Collapse** | All NPCs stop talking to you | Consequence of actions | Slow, boring |
| **D: Killer Escapes** | Evidence destroyed, killer flees | Dramatic | Player feels cheated |

**Suggested: B + D Combined**
- Day 14: Case officially closed by Thom
- Evidence is destroyed/buried
- Hooded figure escapes forever
- Truth becomes unknowable
- NPCs move on, won't discuss it

**Failure Tiers:**
```
COLD CASE: Ran out of time, never accused anyone
WRONG MAN: Accused innocent, real killer escaped
CHAOS: Multiple wrong accusations, everyone hates you
ABANDONED: Stopped playing, world moved on without you
```

**Wrong Accusation = Soft Fail:**
- Not game over
- But: Major trust loss, real killer harder to catch
- Limited accusations (3 total?)

---

### 3. DAILY CONTRACT - What does player get each day?

**The Promise:**
Every real day, the player receives:

```
MORNING (Push notification)
├── One message from an NPC
├── Contains: new info, rumor, event, or summons
└── Creates reason to open game

DURING DAY (When player engages)
├── NPCs available to talk
├── One "daily clue" discoverable
├── Actions have consequences
└── Words spread in real-time

EVENING (When player checks back)
├── Consequence report
├── "Here's what spread today"
├── Preview of tomorrow's tension
└── World tick begins

OVERNIGHT (Passive)
├── NPCs interact off-screen
├── Events generated
├── Tomorrow's content prepared
└── Day advances
```

**The Daily Clue:**
- Each day, ONE key piece of information is available
- Might come from: NPC conversation, event, discovery
- Miss it? Harder to get later (not impossible)
- Creates "did I find today's clue?" tension

**Minimum Engagement:**
- ~5 minutes to get daily value
- Deeper investigation rewards more
- But casual play still progresses

---

### 4. ACTION SPACE - What can player actually DO?

**Currently:** Talk to NPCs (that's it)

**Proposed Actions:**

```
TALK [NPC]          - Conversation (current system)
ASK [NPC] ABOUT [X] - Directed questioning (more pointed)
ACCUSE [NPC]        - Formal accusation (high stakes)
INVESTIGATE [PLACE] - Examine location (cellar, room, etc)
SHOW [CLUE] TO [NPC]- Present evidence, get reaction
WAIT                - Skip to next time period
THINK               - Review what you know (gut voice)
CONFRONT [NPC]      - Aggressive questioning (risky)
```

**Action Consequences:**

| Action | Consequence |
|--------|-------------|
| TALK | Trust +1, info exchanged, words may spread |
| ASK ABOUT | Direct answer, but NPC notices your interest |
| ACCUSE | Major - right = win, wrong = penalty |
| INVESTIGATE | May find clues, takes time |
| SHOW CLUE | NPC reacts, may reveal more or get defensive |
| CONFRONT | May crack them, may backfire badly |

**Limited Resources:**
- 3 accusations total (use wisely)
- Confrontations damage trust
- Time passes (can't do everything in one day)

---

### 5. CONSEQUENCE RULES - What happens when they act?

**Rule 1: Words Spread**
```
Anything you say to NPC may spread to connected NPCs.
By evening, others may know what you asked about.

Gossip Network:
Maren ↔ Kira (close friends, share everything)
Aldric ↔ Thom (drinking buddies)
Elena ↔ Maren (professional respect)
Thom → Everyone (he's the authority)
```

**Rule 2: NPCs React to Reputation**
```
Reputation: Newcomer → Curious → Investigator → Threatening → Dangerous

Low reputation: NPCs are helpful
High reputation: NPCs get nervous, guarded, or hostile
```

**Rule 3: Wrong Accusations Cost**
```
First wrong accusation: -20 trust with everyone, warning
Second wrong accusation: -30 trust, NPCs stop sharing secrets
Third wrong accusation: Game over - nobody trusts you
```

**Rule 4: Time Costs**
```
Each action takes time. Day has limited slots:
- Morning: 2 actions
- Afternoon: 3 actions
- Evening: 2 actions

Choose wisely. Can't talk to everyone every day.
```

**Rule 5: Clues Connect**
```
When player has 2+ related clues, system notices.
"You realize: Aldric's alibi contradicts Kira's observation."
Unlocks new dialogue options.
```

**Rule 6: NPCs Have Goals**
```
NPCs aren't just info dispensers. They want things:
- Maren: Protect tavern, find truth
- Aldric: Avoid suspicion, get paid
- Thom: Bury the case, protect himself
- Kira: Stay neutral, profit
- Elena: Stay out of it, heal people

Their goals affect what they tell you and when.
```

---

## SUMMARY: The Skeleton

```
WIN:    Accuse correctly + get confession
LOSE:   Day 14 + no solution, or 3 wrong accusations
DAILY:  Morning hook → Investigation → Evening consequences
ACTIONS: Talk, Ask, Accuse, Investigate, Show, Confront
RULES:  Words spread, reputation matters, accusations cost, time is limited
```

AI generates CONTENT within this STRUCTURE.

---

## THE SIMULATION MODEL (Inspired by Stanford Simulacra)

### Reference: Stanford Generative Agents Paper
Source: [arXiv:2304.03442](https://arxiv.org/abs/2304.03442)

---

### Stanford Architecture (What They Did)

**Three Core Components:**

```
1. MEMORY STREAM
   ├── Complete record of experiences in natural language
   ├── Timestamped observations
   ├── "Saw Aldric at the forge at 10am"
   └── Raw, unprocessed events

2. REFLECTION
   ├── Periodic synthesis of memories into insights
   ├── "I've noticed Aldric avoids Thom lately"
   ├── Higher-level patterns, not just events
   └── Triggers: time passed OR importance threshold

3. PLANNING
   ├── Daily schedule (wake, work, eat, sleep)
   ├── Multi-timescale goals (today, this week, life)
   ├── Plans can be interrupted/revised
   └── React to unexpected events
```

**Memory Retrieval (Critical):**
```
When deciding what to do:
1. Recency - Recent memories weighted higher
2. Importance - Significant events weighted higher
3. Relevance - Related to current situation weighted higher

Score = Recency × Importance × Relevance
Retrieve top-K memories for context
```

**Emergent Behaviors They Observed:**
- Valentine's party self-organized from single seed
- Agents coordinated timing without programming
- Relationships formed and evolved
- Information spread through social network
- Agents developed opinions about each other

**What Made It Work:**
- Agents had ROUTINES (predictable baseline)
- Agents had GOALS (desires that drive action)
- Agents REMEMBERED (continuity across time)
- Agents REFLECTED (formed opinions, not just recalled)
- Agents INTERACTED (with each other, not just player)

---

### Our Architecture (Adapted for Wanderer's Rest)

**Per-NPC State:**

```
NPC {
  identity: {
    name, role, personality, voice
  }

  memory_stream: [
    { time, observation, importance }
    // "Day 3, 10am: New owner asked about Harren's death"
    // "Day 3, 2pm: Aldric seemed nervous at lunch"
  ]

  reflections: [
    { insight, supporting_memories, day_formed }
    // "The new owner is investigating Harren's death seriously"
    // "Aldric is hiding something about that night"
  ]

  relationships: {
    [npc_id]: {
      trust: 0-100,
      opinion: string,
      recent_interactions: []
    }
  }

  current_goals: [
    { goal, priority, deadline }
    // "Avoid suspicion" (high, ongoing)
    // "Collect debt from estate" (medium, day 7)
  ]

  daily_schedule: [
    { time, activity, location }
    // 6am: Wake, prepare bar
    // 8am: Open tavern
    // 12pm: Lunch rush
    // ...
  ]

  emotional_state: {
    mood: string,
    stress: 0-100,
    triggers: []
  }
}
```

---

### IMPROVEMENTS ON STANFORD (Our Additions)

**1. Emotional State Modeling**
```
Stanford: Implicit in memories
Us: Explicit emotional state that affects behavior

stress > 80 → more likely to slip up, reveal secrets
mood = anxious → shorter responses, evasive
triggers = ["Harren", "that night"] → emotional reaction
```

**2. Relationship Graph with Dynamics**
```
Stanford: Agents had relationships
Us: Relationships CHANGE based on events

trust_delta when:
  - You share secret with them: +10
  - They hear you accused their friend: -20
  - You help them: +15
  - You ignore them for 3 days: -5
```

**3. Goal Conflict Detection**
```
Stanford: Agents had goals
Us: System detects when goals CONFLICT

Aldric goal: "Avoid suspicion"
Player action: "Asking about forge alibi"
Conflict detected → Aldric becomes defensive

Maren goal: "Find truth about Harren"
Thom goal: "Bury the case"
Conflict detected → Tension scene generated
```

**4. Information Propagation Model**
```
Stanford: Info spread organically
Us: Explicit gossip network with rules

When NPC learns something:
  - Check relationship graph
  - Will they share? (based on trust, relevance)
  - With whom? (based on closeness)
  - How fast? (based on importance)
  - How accurately? (based on telephone effect)
```

**5. Environmental Pressure**
```
Stanford: Open-ended simulation
Us: Mystery creates pressure that escalates

Day 1-7: Low pressure, NPCs relaxed
Day 8-11: Pressure building, NPCs nervous
Day 12-14: High pressure, secrets slip, confrontations happen

Pressure affects: mood, willingness to talk, likelihood of events
```

**6. Player as Perturbation**
```
Stanford: Player could interact
Us: Player presence explicitly modeled

When player talks to NPC:
  - NPC's stress changes
  - Nearby NPCs notice
  - Conversation enters memory stream
  - Ripple effects propagate

When player is ABSENT:
  - NPCs interact with each other
  - Events still happen
  - Drama unfolds
```

---

### MEASURING "BETTER" SIMULATIONS

**1. Believability (Human Eval)**
```
Test: Show human transcript of NPC day
Ask: "Does this feel like a real person?"
Metrics:
  - Consistency (do they contradict themselves?)
  - Personality (do they stay in character?)
  - Reactivity (do they respond to events logically?)
```

**2. Emergence (System Eval)**
```
Test: Run simulation with seed event
Measure:
  - Did unexpected-but-logical events occur?
  - Did NPCs form new relationships?
  - Did information spread realistically?
  - Did conflicts arise naturally?
```

**3. Narrative Coherence (Human Eval)**
```
Test: Show human 7-day summary
Ask: "Does this feel like a story?"
Metrics:
  - Cause and effect clear?
  - Character arcs visible?
  - Tension builds?
  - Resolution satisfying?
```

**4. Engagement (User Metrics)**
```
Measure:
  - How often does player check in?
  - How long do they stay?
  - Do they ask follow-up questions?
  - Do they feel compelled to intervene?
```

**5. Consistency Over Time**
```
Test: Check NPC behavior across days
Measure:
  - Memory retrieval accuracy
  - Personality drift (should be low)
  - Relationship continuity
  - Goal progression
```

---

### THE HUMAN'S ROLE (Peeking & Intervention)

**Why Human Matters:**

```
SIMULATION WITHOUT HUMAN:
└── NPCs interact
└── Events happen
└── But... for whom?
└── No witness = no story

SIMULATION WITH HUMAN PEEKING:
└── Human attention = spotlight
└── "What the human watches becomes important"
└── Creates narrative focus
└── Gives meaning to events
```

**Human as Director:**
```
Pure simulation: Aimless, everything equally weighted
Human attention: Creates hierarchy of importance

Human asks about Aldric → Aldric scenes become "main plot"
Human ignores Elena → Elena becomes "subplot"
Human witnesses confrontation → It becomes "the climax"
```

**Human as Pressure:**
```
Equilibrium: NPCs settle into routines
Human questions: Disrupts equilibrium

"Where were you that night?"
→ Aldric's stress increases
→ He talks to Thom about it
→ Thom gets nervous
→ Thom visits Elena
→ Cascade of reactions

Human is the stone in the pond.
```

**Human as Validation:**
```
AI generates events
Human reacts (or doesn't)
Reaction = feedback signal

Human finds something interesting → More of that
Human skips something → Less of that
Implicit training of narrative

(We can use this to tune what the simulation emphasizes)
```

**The Peeking Mechanic:**
```
PASSIVE VIEWING:
- See summary of what happened
- "While you were away..."
- Observatory mode

ACTIVE INTERVENTION:
- Talk to NPC, disrupt their day
- Ask questions, create stress
- Make accusations, force reactions

HYBRID (Sweet Spot):
- Watch the opera unfold
- Choose moments to step on stage
- Your presence matters but isn't required
```

---

### DESIGN DECISION: Player as Viewer

**Confirmed:**
- Simulation runs whether player is there or not
- NPCs have lives, goals, routines
- Events emerge from NPC interactions
- Player is witness who CAN intervene
- Player attention shapes narrative focus
- Player questions create perturbations

**The New Metaphor:**
```
Old: Player is detective solving case
New: Player is new owner watching drama unfold

You inherited a tavern.
You inherited its secrets.
You inherited its people.

Watch them. Or join them. Your choice.
```

---

## GAMIFYING THE WATCHING (Passive → Interactive)

### The Problem

Watching isn't playing. How do we make observation feel like participation?

---

### Models From Other Media

| Medium | How They Gamify Watching |
|--------|--------------------------|
| **Bandersnatch** | Key decision points, binary choices |
| **Twitch Plays** | Crowd votes, aggregate control |
| **Reality TV** | Vote to eliminate, affect outcomes |
| **Reigns** | Swipe left/right on proposals |
| **Betting** | Predict outcomes, stake something |
| **Stock Market** | Invest attention in what you think matters |

---

### Possible Mechanics for Wanderer's Rest

**1. INTERVENTION MOMENTS**
```
Simulation runs...
Then: "Aldric is about to confront Thom."

[LET IT HAPPEN]  or  [INTERVENE]

Your choice affects outcome.
```
- Not constant control
- Key dramatic moments
- Player shapes TURNING POINTS

---

**2. SIDE-TAKING**
```
Maren and Aldric are arguing about the debt.

Who do you support?
[MAREN]  [ALDRIC]  [STAY NEUTRAL]

Your support → Their confidence increases
Your opposition → They become defensive/hostile to you
Neutral → Drama continues, you stay observer
```
- You don't control, you INFLUENCE
- NPCs know whose side you're on
- Creates relationship consequences

---

**3. INFORMATION BROKERING**
```
You know: Kira saw the forge was cold.
Aldric doesn't know you know.

[TELL ALDRIC] → He knows you're onto him
[TELL MAREN] → She investigates
[TELL THOM] → Official pressure
[KEEP SECRET] → Leverage for later
```
- You control INFORMATION FLOW
- Knowledge is power
- Creates strategic gameplay

---

**4. SIMPLE RULINGS**
```
Elena asks: "Should I tell the guards what I saw?"

[YES, TELL THEM]
[NO, STAY QUIET]
[TELL ME FIRST]

Your advice affects her action.
Her action affects the simulation.
```
- NPCs consult you (you're the owner)
- Binary choices with consequences
- Makes you feel important without controlling everything

---

**5. RESOURCE ALLOCATION**
```
End of day. As tavern owner:

Who gets a free drink tonight?
[ ] Maren (she looks tired)
[ ] Aldric (he's stressed)
[ ] Thom (keep him happy)
[ ] Nobody (save money)

→ Your choice affects mood, willingness to talk
```
- Tavern owner role = resource control
- Simple decisions with subtle effects
- Integrates with simulation naturally

---

**6. ATTENTION = INVESTMENT**
```
Two things are happening:
A) Kira is meeting someone outside
B) Maren is reading an old letter

You can only watch one. Which?

[WATCH KIRA]  [WATCH MAREN]

→ You see one scene, miss the other
→ Creates FOMO, replayability
→ Your attention shapes YOUR story
```
- Not controlling outcomes
- Controlling your PERSPECTIVE
- Different players see different narratives

---

**7. PREDICTION BETTING**
```
The week ahead:

Who do you think killed Harren?
[ ] Aldric
[ ] Thom
[ ] Elena
[ ] The stranger
[ ] Someone else

Lock in your theory. See if you're right.
→ Correct = bonus insight/scene
→ Wrong = dramatic irony (you were fooled)
```
- Engages analytical thinking
- Stakes without punishment
- Rewards paying attention

---

**8. CONFLICT RESOLUTION (Judge Role)**
```
Aldric and Maren are in a dispute.
Both turn to you.

"You're the owner now. What do you think?"

[ALDRIC IS RIGHT]
[MAREN IS RIGHT]
[BOTH HAVE A POINT]
[NONE OF MY BUSINESS]

Your judgment = reputation effect with both
```
- You're pulled INTO drama
- Not causing it, RESOLVING it
- Power without control

---

### Recommended Combination

**Light Touch Model:**
```
80% WATCHING
├── Simulation runs
├── Events unfold
├── You observe summaries
└── Drama happens

20% INTERACTING
├── Intervention moments (1-2 per day)
├── Simple rulings when asked
├── Information broker choices
└── Attention allocation
```

**The Feel:**
- You're the new owner
- People come to you with problems
- You give quick opinions
- Then watch what happens
- Your nudges ripple through the simulation

---

### UX Pattern

```
MORNING:
"Last night, Aldric and Thom argued.
Aldric stormed out.
Today, Aldric hasn't come to the tavern."

→ [CHECK ON ALDRIC] or [ASK MAREN] or [WAIT AND SEE]

AFTERNOON:
You chose to wait.
Maren: "Aldric came back. He's in the corner. Won't talk to anyone."

→ [APPROACH HIM] or [GIVE HIM SPACE] or [SEND HIM A DRINK]

EVENING:
You sent a drink.
Aldric: "...thanks. You're not like Harren."
He seems more willing to talk tomorrow.

[END OF DAY SUMMARY]
```

Small choices. Big ripples. Mostly watching.

---

### Key Insight

**You're not the protagonist. You're the OWNER.**

Owners don't fight battles. They:
- Observe their domain
- Make judgment calls
- Allocate resources
- Support or oppose
- Shape the environment

The DRAMA is between NPCs.
You STEER it with light touches.

---

*This is a living document. Update as decisions are made.*
