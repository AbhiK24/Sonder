# Sonder

> *n.* the realization that each passerby has a life as vivid and complex as your own

**An engine for chat-based games where NPCs feel alive.**

Local-first. LLM-powered. Conversation-driven. Your world grows on your machine.

---

## What is Sonder?

Sonder is a game engine for building text-based games where:

- **NPCs remember everything** — Every conversation is stored. Reference what they said weeks ago.
- **NPCs can lie** — Track what each character claims. Cross-reference. Catch contradictions.
- **Conversations have consequences** — What you say matters. Trust builds. Secrets spread.
- **The world lives without you** — Events happen while you're away. Return to find things changed.
- **Your world is yours alone** — Local-first. No servers. Your save, your story.

## 🎮 Play Now

The first soul, **Wanderer's Rest**, is playable on Telegram:

```bash
# Clone and install
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install

# Configure (add your API keys)
cp .env.example .env

# Run the bot
pnpm telegram
```

Then message **@WandererRestBot** on Telegram.

## The First Soul: Wanderer's Rest

*You inherit a tavern. The previous owner died under mysterious circumstances. Solve the mystery through conversation alone.*

**NPCs:**
| Character | Role | Category |
|-----------|------|----------|
| **Maren** | Barkeep | Townspeople |
| **Kira** | Traveling Merchant | Visitor |
| **Aldric** | Blacksmith | Townspeople |
| **Elena** | Herbalist | Townspeople |
| **Thom** | Guard Captain | Townspeople |
| **???** | Hooded Figure | Stranger |

**The Mystery:** Old Harren "fell" down the cellar stairs. Maren doesn't believe it. As trust builds, she reveals more. Someone in town is lying.

## Features

### 💬 Telegram Bot with Game Commands

Talk naturally or use ALL CAPS commands:

| Command | Description |
|---------|-------------|
| `LOOK` | The tavern describes itself |
| `THINK` | Your gut instinct speaks |
| `OBSERVE` | Watch who you're talking to |
| `STATUS` | See all relationships |
| `CASE` | View active mysteries |
| `CLUES` | Review discovered evidence |
| `FACTS` | What you've learned |
| `SUSPICIONS` | Contradictions noticed |
| `TOKENS` | View LLM token usage |
| `DASHBOARD` | Link to visual dashboard |

Switch NPCs by name: `MAREN`, `KIRA`, `ALDRIC`, etc.

### 🔍 Lie Detection System

NPCs make claims. The system tracks them:

```
Aldric: "I was at the forge all night."
[Fact stored: aldric, "was at forge all night", day 2]

Later...
Kira: "The forge was cold when I passed it."
[Contradiction detected!]

→ Your gut speaks: "Something about what Aldric said doesn't add up..."
```

### 🌙 World Tick (Events While Away)

Real time passes. 1 real day = 1 game day.

- Return after 1+ hours → Events happened while you were gone
- NPCs interact with each other
- Clues surface, rumors spread
- The world doesn't wait for you

### 📊 Visual Dashboard

```bash
pnpm dashboard
# Opens at http://localhost:3000
```

See your game visually:
- NPC portraits with trust meters
- Case progress board
- Clues and facts journal
- Suspicions panel

### 🎨 Auto-Generated NPC Portraits

```bash
# Generate all NPC images
pnpm generate-images

# Create a new NPC with portrait
pnpm create-npc
```

Uses DALL-E 3 to create consistent fantasy character art.

### 🤖 Bring Your Own Model (BYOM)

| Provider | Setup | Cost |
|----------|-------|------|
| **Kimi** (Moonshot) | API key | ~$0.01/session |
| **OpenAI** | API key | ~$0.01/session |
| **Anthropic** | API key | ~$0.01/session |
| **Ollama** | Local install | Free |

## Architecture

```
sonder/
├── packages/
│   ├── engine/                 # Core game engine
│   │   └── src/
│   │       ├── llm/            # LLM providers (Kimi, OpenAI, Ollama)
│   │       ├── memory/         # Markdown file parsing
│   │       ├── cases/          # Case system & FTUE
│   │       ├── utils/          # Fact store, lie detection, tokens
│   │       ├── scripts/        # NPC creation, image generation
│   │       └── telegram-bot.ts # Main bot
│   │
│   ├── dashboard/              # Visual web dashboard
│   │   ├── public/             # HTML/CSS/JS
│   │   ├── assets/npcs/        # Generated portraits
│   │   └── src/server.ts       # Express server
│   │
│   └── souls/
│       └── wanderers-rest/     # First playable soul
│           └── npcs/           # NPC identity files
│               ├── maren/
│               ├── kira/
│               ├── aldric/
│               ├── elena/
│               ├── thom/
│               └── hooded/
```

## NPC Identity Files

Each NPC is defined by markdown files you can read and edit:

```
npcs/maren/
├── IDENTITY.md     # Personality, voice, quirks, secrets
├── MEMORY.md       # What she knows about others
└── STATEMENTS.md   # Claims she's made (verified/unverified)
```

Example `IDENTITY.md`:
```markdown
# Maren

## Role
Barkeep

## Personality
- Watchful and protective
- Slow to trust, fiercely loyal once earned
- Knows everyone's secrets, keeps them

## Voice Patterns
- Short sentences. Doesn't waste words.
- Speaks in observations, not opinions.

## Secrets
- Found Harren's body. Saw something she hasn't told anyone.
```

## Scripts

```bash
pnpm telegram          # Run Telegram bot
pnpm dashboard         # Run visual dashboard
pnpm create-npc        # Interactive NPC creator
pnpm generate-images   # Generate NPC portraits
pnpm typecheck         # TypeScript check
```

## Configuration (.env)

```bash
# LLM Provider (kimi, openai, anthropic, ollama)
LLM_PROVIDER=kimi
KIMI_API_KEY=sk-...

# For image generation
OPENAI_API_KEY=sk-...

# Telegram Bot
TELEGRAM_BOT_TOKEN=...
```

## Development Status

✅ **Playable Alpha**

- [x] Telegram bot with conversation
- [x] Multiple NPCs with unique voices
- [x] Trust system & relationship tracking
- [x] Two narrative voices (Tavern + Gut)
- [x] World tick (events while away)
- [x] Fact extraction from conversations
- [x] Lie detection & contradiction alerts
- [x] Case system with FTUE mystery
- [x] Persistence (save/load)
- [x] Visual dashboard
- [x] NPC portrait generation
- [x] Token usage tracking
- [ ] Procedural case generation (after day 7)
- [ ] More souls/worlds
- [ ] Discord integration

## Philosophy

**NPCs should feel like someone, not something.**

Most game NPCs are vending machines. Insert coin, receive dialogue. Sonder NPCs:

- Remember what you said
- Hold opinions about you
- Talk to each other when you're not there
- Keep secrets (and sometimes slip)
- Contradict each other (intentionally or not)
- Can be caught in lies

**The engine is open. The worlds are infinite. The stories are yours.**

## License

- **Engine** (`packages/engine`): MIT
- **Souls** (`packages/souls/*`): See individual LICENSE files

## Credits

Inspired by:
- [OpenClaw](https://github.com/openclaw/openclaw) — Memory architecture
- Her Story, LA Noire, Contradiction — Investigation design
- Disco Elysium — Narrative voice
- Stardew Valley — Daily ritual, found family

---

*The tavern keeper who listens. The one who finds the truth.*
