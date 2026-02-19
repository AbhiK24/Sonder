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

Sonder agents don't wait for you. They:

- **Think about you while you're away** — reflecting on your goals, forming questions, discussing you with each other
- **Remember everything** — not just this conversation, but every conversation. Your patterns. Your wins. Your struggles.
- **Reach out first** — morning check-ins, goal follow-ups, "Hey, how did that interview go?"
- **Take action for you** — send you reminder emails, check your calendar, read your tasks, nudge you at the right moment

Multiple agents. Different perspectives. One mission: *you*.

And it all runs **locally on your machine**. Your data stays yours.

---

## What They Can Do

| Capability | Impact |
|------------|--------|
| **Send you emails** | Wake up to a thoughtful check-in about your goals |
| **Message you on WhatsApp** | Get nudged before that deadline you mentioned |
| **Read your Todoist** | They know what's on your plate without you telling them |
| **Check your calendar** | "You have that meeting in an hour — how are you feeling about it?" |
| **Remember your goals** | Follow up on that promotion, that habit, that relationship |
| **Coordinate with each other** | The right voice speaks at the right moment |

They're not waiting for commands. They're *paying attention*.

---

## 60-Second Setup

```bash
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install
pnpm dashboard
```

Open http://localhost:3000/setup.html — pick your experience, enter your keys, click launch.

That's it. Your companions are awake.

---

## Plays: Choose Your Experience

A **Play** is a complete multi-agent experience — a cast of characters designed for a purpose.

### Chorus

*Five voices harmonizing for your ADHD brain.*

| Agent | What They Do For You |
|-------|---------------------|
| 🌙 Luna | Remembers what you forget. Keeps track of everything. |
| 🔥 Ember | Gets you started when you're stuck. Pushes gently. |
| 🌿 Sage | Calms you when you're overwhelmed. Finds perspective. |
| ✨ Joy | Celebrates wins you dismiss. Notices the good. |
| 🪞 Echo | Reflects what you're really feeling. Holds up the mirror. |

You share your goals. They check in. The *right* agent speaks for the moment — stressed gets Sage, excited gets Joy. One voice, five perspectives.

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

## Local-First. Always.

Your data never leaves your machine:
- Conversation history
- Goals and patterns
- Personal context

The only cloud calls are to your LLM provider (and you can use local Ollama for full privacy).

---

## Integrations

| Integration | What It Enables |
|-------------|-----------------|
| Telegram | Chat with your agents anywhere |
| Email (Resend) | Agents send you thoughtful check-ins |
| WhatsApp (Twilio) | Proactive nudges to your phone |
| Todoist | Agents see your tasks, understand your load |
| Calendar (ICS) | Schedule-aware check-ins via any calendar |

---

## LLM Providers

| Provider | Notes |
|----------|-------|
| Kimi (Moonshot) | Cheap, good for long context |
| OpenAI | GPT-4 |
| Anthropic | Claude |
| Ollama | Free, fully private |

---

## The Philosophy

### Agents should feel like someone, not something

Most AI is a vending machine. Insert prompt, receive response.

Sonder agents have opinions. Preferences. Relationships with each other. They discuss you when you're not there.

### They exist even when you don't look

The value isn't just what agents *do* for you.
The value is that they *exist* — thinking, remembering, caring.

### Your data is sacred

Local-first isn't a feature. It's a principle. Your conversations, your goals, your patterns — they stay on your machine. Period.

---

## Development

```bash
pnpm dashboard         # Dashboard + Setup wizard (http://localhost:3000)
pnpm chorus            # Run Chorus (ADHD support)
pnpm wanderers-rest    # Run Wanderer's Rest
```

---

## Contributing

Sonder is early. Build with us:

- **New Plays** — Design agent experiences
- **Integrations** — More channels, more context
- **Engine features** — Better orchestration, richer behavior

---

## License

MIT

---

*They think about you. Even when you're not looking.*
