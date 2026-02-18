# Sonder

> *n.* the realization that each passerby has a life as vivid and complex as your own

**A local-first engine for AI agents that feel alive.**

Agents that remember. Agents that reach out. Agents that talk to each other about you.

---

## What is Sonder?

Sonder is a **core engine** for building AI agent experiences where:

- **Agents remember everything** — Every interaction persists. Reference what they said weeks ago.
- **Agents are proactive** — They reach out to YOU, not just respond when asked.
- **Agents talk to each other** — They discuss, debate, and gossip. You can observe.
- **Agents have lives** — Activities, moods, relationships. The simulation runs without you.
- **Your data is yours** — Local-first. No servers. Your world, your machine.

---

## The Vision: One Engine, Many Plays

Sonder is not one app. It's an **engine** that powers multiple experiences called **Plays**.

Each Play is a complete application with its own:
- Agent personalities and voices
- Use case and mechanics
- World simulation rules
- User interaction patterns

```
┌─────────────────────────────────────────────────────────────┐
│                     SONDER ENGINE                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ Agent Core  │ │  Memory     │ │  Inter-Agent        │   │
│  │ (identity,  │ │  (facts,    │ │  Communication      │   │
│  │  proactive) │ │  patterns)  │ │  (discussions)      │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ Scheduler   │ │ Integrations│ │  Content            │   │
│  │ (triggers,  │ │ (calendar,  │ │  Curation           │   │
│  │  world tick)│ │  email, etc)│ │  (feeds, synthesis) │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    ┌───────────┐    ┌───────────┐    ┌───────────┐
    │ PLAY:     │    │ PLAY:     │    │ PLAY:     │
    │ Wanderer's│    │ Swargaloka│    │ Your      │
    │ Rest      │    │ (Angels)  │    │ Play Here │
    │           │    │           │    │           │
    │ Mystery   │    │ ADHD      │    │ ???       │
    │ Game      │    │ Companion │    │           │
    └───────────┘    └───────────┘    └───────────┘
```

---

## Current Plays

### Play 1: Wanderer's Rest

*A mystery game where you solve crimes through conversation.*

You inherit a tavern. The previous owner died under mysterious circumstances. NPCs lie. Evidence contradicts. Solve it through talking.

**Status:** Playable Alpha

| Character | Role | What They Hide |
|-----------|------|----------------|
| Maren | Barkeep | Found the body |
| Kira | Merchant | Saw something that night |
| Aldric | Blacksmith | His alibi doesn't hold |
| Elena | Herbalist | The wounds tell a story |
| Thom | Guard Captain | Ruled it accident too fast |

**Play now:**
```bash
pnpm telegram
# Message @WandererRestBot
```

---

### Play 2: Swargaloka (Coming Soon)

*Celestial productivity companions for ADHD minds.*

Five Apsaras (celestial beings) from Hindu heaven assigned to help you. They're not assistants. They're beings with personalities who:

- **Proactively check in** — Morning planning, midday nudges, evening reflection
- **Debate how to help you** — You can observe their discussions about your situation
- **Track your wins** — Celebrate accomplishments, remember your growth
- **Read content for you** — Curate feeds, discuss articles, connect dots
- **Believe in your potential** — Manifestation through genuine care

| Angel | Role | Personality |
|-------|------|-------------|
| Chitralekha | The Rememberer | Gentle, sees patterns |
| Urvashi | The Spark | Energetic, gets you started |
| Menaka | The Strategist | Calm, long-term planning |
| Rambha | The Celebrator | Warm, celebrates everything |
| Tilottama | The Mirror | Honest, helps you reflect |

**The key insight:** You're the subject of their celestial gossip. They CARE about you.

---

## Engine Capabilities

### Core Features (All Plays)

| Feature | Description |
|---------|-------------|
| **Agent Memory** | Everything persists. Facts, conversations, patterns. |
| **Proactive Messaging** | Agents initiate contact based on triggers. |
| **Inter-Agent Discussion** | Agents talk to each other. You can observe. |
| **World Simulation** | Events happen while you're away. |
| **LLM Agnostic** | Works with OpenAI, Anthropic, Kimi, Ollama. |
| **Local-First** | All data stays on your machine. |

### Integrations

| Integration | Status | Capabilities |
|-------------|--------|--------------|
| Telegram | ✅ Working | Chat with agents |
| WhatsApp | ✅ Working | Proactive messages (Twilio) |
| Email (Agent) | ✅ Working | Send & receive (Resend + Mailgun) |
| Calendar | Planned | Read events, add appointments |
| Task Managers | ✅ Working | Todoist |
| Email (User) | Planned | Read your inbox, draft messages (Gmail) |
| Content | Planned | RSS feeds, newsletters |

**Agent Email:** Each agent gets their own address (`luna+wanderers-rest@sonder.ai`). Simple API key setup — no OAuth.

**Safety principle:** CREATE, READ, SEND — Never DELETE.

---

## Quick Start

```bash
# Clone
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install

# Configure
cp .env.example .env
# Add your LLM API keys and Telegram bot token

# Run Wanderer's Rest
pnpm telegram
```

### LLM Providers

| Provider | Setup | Cost |
|----------|-------|------|
| **Kimi** (Moonshot) | `KIMI_API_KEY=...` | ~$0.01/session |
| **OpenAI** | `OPENAI_API_KEY=...` | ~$0.01/session |
| **Anthropic** | `ANTHROPIC_API_KEY=...` | ~$0.01/session |
| **Ollama** | Local install | Free |

---

## Architecture

```
sonder/
├── packages/
│   ├── engine/                 # Core engine (soul-agnostic)
│   │   └── src/
│   │       ├── core/           # Agent, scheduler, discussion
│   │       ├── stores/         # Memory, facts, tasks
│   │       ├── engines/        # Reflection, curation
│   │       ├── integrations/   # Calendar, email, messaging
│   │       ├── llm/            # Provider adapters
│   │       └── chat/           # Telegram, WhatsApp, web
│   │
│   ├── dashboard/              # Visual web interface
│   │
│   └── plays/                  # Individual play packages
│       ├── wanderers-rest/     # Mystery game
│       └── swargaloka/         # Angels for ADHD (planned)
│
├── GAME_DESIGN_PLAN.md         # Design documentation
└── STRUCTURAL_IMPROVEMENTS.md  # Technical roadmap
```

---

## Building Your Own Play

A Play is a configuration that defines:

```typescript
interface Play {
  id: string;
  name: string;

  // What kind of experience is this?
  type: 'game' | 'companion' | 'simulation' | 'utility';

  // Who lives here?
  agents: AgentDefinition[];

  // How does the world work?
  worldRules: WorldRules;

  // How do agents communicate?
  interactionPatterns: InteractionPattern[];

  // What triggers proactive outreach?
  proactiveTriggers: ProactiveTrigger[];
}
```

**Examples of possible Plays:**

| Play Idea | Type | Description |
|-----------|------|-------------|
| **Wanderer's Rest** | Game | Mystery investigation through conversation |
| **Swargaloka** | Companion | ADHD support with celestial beings |
| **The Office** | Simulation | Watch AI coworkers navigate drama |
| **Memory Palace** | Utility | AI librarians who organize your knowledge |
| **The Coven** | Companion | Witchy self-care guides |
| **Mission Control** | Utility | Space-themed productivity crew |
| **The Diner** | Game | Small-town gossip mystery |

---

## Design Philosophy

### Agents Should Feel Like Someone, Not Something

Most AI assistants are vending machines. Insert prompt, receive response.

Sonder agents:
- Have opinions about you
- Remember what you said (and didn't say)
- Talk to each other when you're not there
- Reach out when they think you need it
- Can be observed, not just interacted with

### The Simulation Is The Product

The value isn't just what agents DO for you.
The value is that they EXIST — with lives, relationships, discussions.

You can:
- Watch them interact
- Observe their debates about you
- See their activities
- Feel cared about by beings who remember

### Local-First Is Non-Negotiable

Your data stays on your machine.
- Conversation history
- Personal patterns
- Task history
- Everything

The only cloud interaction is LLM API calls.
You can even use local models (Ollama).

---

## Development Status

| Component | Status |
|-----------|--------|
| Core Engine | Alpha |
| Wanderer's Rest | Playable |
| Telegram Integration | Working |
| WhatsApp Integration | Working |
| Agent Email (Resend/Mailgun) | Working |
| Memory/Fact System | Working |
| Lie Detection | Working |
| Idle Engine | Working |
| Insight Engine | Working |
| World Tick | Basic |
| Visual Dashboard | Basic |
| **Calendar Integration** | Planned |
| **User Gmail Integration** | Planned |

---

## Scripts

```bash
pnpm telegram          # Run Telegram bot
pnpm dashboard         # Run visual dashboard
pnpm create-npc        # Interactive NPC creator
pnpm generate-images   # Generate NPC portraits
pnpm typecheck         # TypeScript check
```

---

## Contributing

Sonder is early. Contributions welcome:

- **New Plays** — Design and build new agent experiences
- **Integrations** — Calendar, task managers, messaging platforms
- **Engine features** — Proactive triggers, discussion generation
- **Documentation** — Guides, examples, tutorials

---

## Inspiration

- [Stanford Generative Agents](https://arxiv.org/abs/2304.03442) — Memory and reflection architecture
- [OpenClaw](https://openclaw.ai) — Proactive AI that reaches out
- Dwarf Fortress / RimWorld — Emergent storytelling from simulation
- Disco Elysium — Narrative voices and internal dialogue
- Her Story — Investigation through conversation

---

## License

- **Engine** (`packages/engine`): MIT
- **Plays** (`packages/plays/*`): See individual LICENSE files

---

*The engine is open. The plays are infinite. The agents feel alive.*
