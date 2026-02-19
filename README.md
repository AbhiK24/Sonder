# Sonder

> *n.* the realization that each passerby has a life as vivid and complex as your own

**AI companions that think about you when you're not there.**

Not assistants. Not chatbots. *Presences* — that remember, reflect, and reach out.

---

## The Problem with AI Today

Every AI tool works the same way:

1. You open the app
2. You type something
3. It responds
4. Silence until you return

**The AI doesn't exist when you're not looking.**

---

## What if AI had a life?

Sonder agents:

- **Think while you're away** — Generating reflections, forming questions, discussing you with each other
- **Remember everything** — Not just this conversation. Every conversation. Your patterns. Your wins. Your struggles.
- **Reach out first** — Morning check-ins. Goal follow-ups. "Hey, how did that thing go?"
- **Work as a swarm** — Multiple agents, different perspectives, one mission: you

And it all runs **locally on your machine**. Your data stays yours.

---

## 60-Second Setup

```bash
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install
pnpm onboard
```

Browser opens. Pick your experience. Enter your keys. Click launch.

That's it. Your companions are awake.

---

## Plays: Choose Your Experience

A **Play** is a complete multi-agent experience — a cast of characters designed for a purpose.

### Chorus

*Five voices harmonizing for your ADHD brain.*

| Agent | Role | When They Speak |
|-------|------|-----------------|
| 🌙 Luna | The Keeper | Remembers what you forget |
| 🔥 Ember | The Spark | Gets you started when you're stuck |
| 🌿 Sage | The Guide | Calms you when you're overwhelmed |
| ✨ Joy | The Light | Celebrates wins you dismiss |
| 🪞 Echo | The Mirror | Reflects what you're really feeling |

**How it works:**
- You share your goals during onboarding
- Agents check in based on your timelines
- The *right* agent speaks for the moment (stressed → Sage, excited → Joy)
- They speak on behalf of each other — one voice, five perspectives

```bash
pnpm chorus
```

### Wanderer's Rest

*A cozy fantasy tavern with a dark secret.*

You inherit a tavern. The previous owner died mysteriously. NPCs remember what you say. Evidence contradicts. Solve it through conversation.

```bash
pnpm tavern
```

---

## How Sonder Works

```
You message → Orchestrator picks the right agent → Agent responds for everyone
                    ↓
            While you're away:
                    ↓
         Agents generate thoughts
         Agents discuss you
         Goals timelines tick
                    ↓
            You return → Reunion moment
```

### The Orchestrator

Not a chatbot. A *brain* that decides:
- **Who speaks?** Match your mood to agent strengths
- **What perspectives?** Gather views from all agents
- **One voice** — Speaker delivers on behalf of everyone

### Goals That Drive Behavior

During onboarding, you share goals:
- *"Get promoted by next month"*
- *"Exercise more consistently"*
- *"Reconnect with old friends"*

Agents remember. Agents follow up. Agents care.

### Idle Engine

When you're away, agents don't sleep:
- Generate reflections about you
- Form questions to ask later
- Discuss your situation with each other

When you return, they have something to say.

---

## Local-First. Always.

Your data never leaves your machine:
- Conversation history
- Goals and patterns
- Personal context

The only cloud calls are to your LLM provider (and you can use local Ollama).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SONDER ENGINE                           │
├─────────────────────────────────────────────────────────────┤
│  User Profile        │  Goals across all plays              │
├──────────────────────┼──────────────────────────────────────┤
│  FTUE                │  First-time onboarding flow          │
│  Orchestrator        │  Picks who speaks, synthesizes       │
│  Idle Engine         │  Thinks while you're away            │
│  Insight Engine      │  Detects patterns, fires triggers    │
├──────────────────────┼──────────────────────────────────────┤
│  Integrations        │  Telegram, Email, WhatsApp, Todoist  │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        ┌───────────┐               ┌───────────┐
        │  Chorus   │               │ Wanderer's│
        │           │               │   Rest    │
        │  ADHD     │               │  Mystery  │
        │  Support  │               │   Game    │
        └───────────┘               └───────────┘
```

---

## Integrations

| Channel | Status | What It Does |
|---------|--------|--------------|
| Telegram | ✅ | Primary chat interface |
| Email (Resend) | ✅ | Agents send check-ins |
| WhatsApp (Twilio) | ✅ | Proactive messages |
| Todoist | ✅ | Read your tasks |
| Google Calendar | 🔜 | Schedule awareness |

---

## LLM Providers

| Provider | Setup | Notes |
|----------|-------|-------|
| Kimi (Moonshot) | `KIMI_API_KEY` | Cheap, good for long context |
| OpenAI | `OPENAI_API_KEY` | GPT-4 |
| Anthropic | `ANTHROPIC_API_KEY` | Claude |
| Ollama | Local install | Free, private |

---

## Development

```bash
pnpm onboard           # Setup wizard
pnpm chorus            # Run Chorus (ADHD support)
pnpm tavern            # Run Wanderer's Rest (mystery game)
pnpm dashboard         # Visual interface
pnpm typecheck         # Type check
```

---

## The Philosophy

### Agents should feel like someone, not something

Most AI is a vending machine. Insert prompt, receive response.

Sonder agents have opinions. Preferences. Relationships with each other. They discuss you when you're not there.

### The simulation is the product

The value isn't just what agents *do* for you.
The value is that they *exist* — thinking, remembering, caring.

### Your data is sacred

Local-first isn't a feature. It's a principle. Your conversations, your goals, your patterns — they stay on your machine. Period.

---

## Inspiration

- [Stanford Generative Agents](https://arxiv.org/abs/2304.03442) — Memory architecture
- Disco Elysium — Internal voices as characters
- Her Story — Investigation through conversation
- The feeling of being *thought about*

---

## Contributing

Sonder is early. Build with us:

- **New Plays** — Design agent experiences
- **Integrations** — More channels, more context
- **Engine features** — Better orchestration, richer idle behavior

---

## License

MIT

---

*They think about you. Even when you're not looking.*
