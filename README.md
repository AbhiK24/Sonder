# Sonder

> *n.* the realization that each passerby has a life as vivid and complex as your own

**An engine for chat-based games where NPCs feel alive.**

Local-first. LLM-powered. Conversation-driven. Your world grows on your machine.

---

## What is Sonder?

Sonder is a game engine for building text-based games where:

- **NPCs remember everything** — Every conversation is stored. Reference what they said weeks ago.
- **Conversations have consequences** — What you say matters. Trust builds. Secrets spread. People leave.
- **The world lives without you** — Events happen while you're away. Return to find things changed.
- **Your world is yours alone** — Local-first. No servers. Your save, your story.

## The First Soul: Wanderer's Rest

*Run a tavern. Know everyone. Solve their problems. Through conversation alone.*

You inherit a failing tavern at a crossroads. The locals are skeptical. When they have problems — thefts, feuds, mysteries — they come to you. Not because you have power. Because you *know people*.

Your only tools: conversation, observation, and memory.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         SONDER                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Engine    │    │    Soul     │    │    Save     │    │
│   │   (MIT)     │    │    (IP)     │    │  (Yours)    │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                  │                  │             │
│   TypeScript         World Bible          NPCs state        │
│   LLM providers      NPCs identity        Memory logs       │
│   Chat integration   Aesthetic            Your story        │
│   World simulation   Starting state                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Bring Your Own Model (BYOM)

We don't ship a model. You configure yours:

| Provider | Setup | Cost |
|----------|-------|------|
| **Ollama** | Local install | Free |
| **LM Studio** | Local GUI | Free |
| **OpenAI** | API key | ~$0.01/session |
| **Anthropic** | API key | ~$0.01/session |
| **MiniMax** | API key (4M context) | ~$0.01/session |

### OpenClaw-Style Memory

Markdown files you can read and edit:

```
~/.sonder/saves/my-tavern/
├── npcs/
│   └── maren/
│       ├── IDENTITY.md     # Who she is
│       ├── MEMORY.md       # What she knows
│       ├── STATEMENTS.md   # What she's said
│       └── logs/           # Daily conversations
├── player/
│   └── PROFILE.md          # Your reputation
└── cases/
    └── active/             # Current mysteries
```

### Two Narrative Voices

**The Tavern** — The building itself observes. Short, atmospheric, never judges.

```
Fire low. Three souls in the common room.
The stranger watches the door. Kira watches the stranger.
Maren watches you.
```

**Your Gut** — Your internal voice. Stakes, stats, options.

```
You promised the miller. Sundown.
→ Reputation: On the line
→ Time: 3 hours
→ Kira knows something — trust too low to push
```

### Natural Language Everything

No slash commands required. Just talk.

```
"Hey Maren, busy night?"
"What do you know about the stranger?"
"I want to talk to Kira"
"Look around"
"I know you're lying"
```

## Quick Start

```bash
# Clone
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder

# Install
pnpm install

# Configure (edit with your settings)
cp .env.example .env

# Run
pnpm dev
```

## Project Structure

```
sonder/
├── packages/
│   ├── engine/                 # @sonder/engine (MIT)
│   │   └── src/
│   │       ├── core/           # Game controller, world engine
│   │       ├── llm/            # Provider abstraction
│   │       ├── memory/         # Markdown file handling
│   │       ├── npcs/           # NPC management
│   │       ├── chat/           # Telegram/Discord
│   │       ├── prompts/        # LLM prompts
│   │       └── types/          # TypeScript types
│   │
│   └── souls/
│       └── wanderers-rest/     # First soul
│           ├── world/          # World bible, aesthetic
│           └── npcs/           # NPC identity files
│
└── docs/                       # Specifications
```

## Documentation

| Document | Description |
|----------|-------------|
| [World Tick Spec](docs/specs/world-tick.md) | How the world simulates |
| [Case Generation Spec](docs/specs/case-generation.md) | How mysteries emerge |
| [Router Spec](docs/specs/router.md) | How input becomes action |
| [Prompts Spec](docs/specs/prompts.md) | All LLM prompts |

## Development Status

🚧 **Early Development** — Not yet playable

- [x] Architecture design
- [x] Technical specifications
- [x] Core types
- [x] Prompt templates
- [x] First soul (Wanderer's Rest)
- [x] First NPC (Maren)
- [ ] LLM provider integration
- [ ] Conversation loop
- [ ] World simulation
- [ ] Telegram bot
- [ ] Case generation

## Philosophy

**NPCs should feel like someone, not something.**

Most game NPCs are vending machines. Insert coin, receive dialogue. Sonder NPCs:

- Remember what you said
- Hold opinions about you
- Talk to each other when you're not there
- Keep secrets (and sometimes slip)
- Leave if you betray them
- Die if you fail them

**The engine is open. The worlds are infinite. The stories are yours.**

## License

- **Engine** (`packages/engine`): MIT
- **Souls** (`packages/souls/*`): See individual LICENSE files

## Contributing

Early days. Open an issue to discuss before PRing.

## Credits

Inspired by:
- [OpenClaw](https://github.com/openclaw/openclaw) — Memory architecture
- Her Story, LA Noire, Contradiction — Investigation design
- Disco Elysium — Narrative voice
- Stardew Valley — Daily ritual, found family

---

*The tavern keeper who listens. The one who finds the truth.*
