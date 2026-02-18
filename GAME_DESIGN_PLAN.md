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

*This is a living document. Update as decisions are made.*
