# Sonder Setup Guide

Complete guide to setting up Sonder with all integrations.

---

## Understanding the Two Identities

Sonder uses **two separate identities**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENTS (Their Identity)                    │
│                                                                 │
│  Email: luna+wanderers-rest@sonder.ai (Resend + Mailgun)       │
│  WhatsApp: +1-415-555-0123 (Twilio number)                     │
│  Telegram: @WanderersRestBot                                    │
│                                                                 │
│  → Agents SEND from these addresses                            │
│  → Each agent+play has unique email                            │
│  → Simple API key setup (no OAuth)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ sends to / helps with
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          USER (You)                             │
│                                                                 │
│  Email: you@gmail.com (agents read + draft here)               │
│  Calendar: your Google Calendar (agents read + create events)  │
│  WhatsApp: +1-555-123-4567 (your phone)                        │
│  Tasks: your Todoist                                            │
│                                                                 │
│  → Agents READ your calendar and inbox (Google OAuth)          │
│  → Agents HELP you manage your accounts                        │
└─────────────────────────────────────────────────────────────────┘
```

**Two email systems:**
- **Agent emails** (Resend/Mailgun) — Agents send AS themselves: `luna@sonder.ai → you@gmail.com`
- **User Gmail** (Google OAuth) — Agents read/draft IN your inbox: help you reply to Sarah

### Example: Calendar Time Block

When Menaka (the Strategist) creates a focus block for you:

```
┌─────────────────────────────────────────────────────┐
│ Calendar Invite                                     │
├─────────────────────────────────────────────────────┤
│ From: Sonder Angels <angels@sonder.app>            │
│ To: you@gmail.com                                   │
│                                                     │
│ 🎯 Focus Time: Proposal Draft                       │
│ Tuesday 2:00 PM - 4:00 PM                          │
│                                                     │
│ Menaka scheduled this focus block for you.         │
│ Your calendar looked clear - protect this time.    │
│                                                     │
│ [Accept] [Decline] [Maybe]                         │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install

# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env

# Run
pnpm telegram
```

---

## Part 1: Core Setup (Required)

### 1.1 LLM Provider

You need ONE of these:

#### Option A: Kimi/Moonshot (Recommended - Cheap)

1. Go to [platform.moonshot.cn](https://platform.moonshot.cn/)
2. Sign up (Chinese phone number required, or use Google)
3. Go to API Keys → Create new key
4. Copy the key

```bash
LLM_PROVIDER=kimi
KIMI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### Option B: OpenAI

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create new secret key
3. Copy the key

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### Option C: Anthropic

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Settings → API Keys → Create Key
3. Copy the key

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### Option D: Ollama (Free, runs locally)

1. Install from [ollama.ai](https://ollama.ai)
2. Pull a model:
   ```bash
   ollama pull qwen2.5:14b
   ```

```bash
LLM_PROVIDER=ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b
```

---

### 1.2 Telegram Bot (For chatting with angels)

1. Open Telegram
2. Search for [@BotFather](https://t.me/BotFather)
3. Send `/newbot`
4. Enter name: `Sonder Angels` (or whatever you want)
5. Enter username: `YourSonderBot` (must end in `bot`)
6. BotFather gives you a token like: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

**Test it:**
```bash
pnpm telegram
# Then message your bot on Telegram
```

---

## Part 2: Sonder's Identity (System Account)

Sonder needs its own accounts to send FROM.

### 2.1 Agent Email (Resend + Mailgun)

Agents need to send and receive email. We use:
- **Resend** — Outbound (agent sends proactive messages)
- **Mailgun** — Inbound (agent's queryable inbox)

Both are simple API key setup. No OAuth nightmare.

#### Email Format

Each agent gets their own address: `agent+play@yourdomain.com`

```
luna+wanderers-rest@sonder.ai    ← Luna in Wanderer's Rest
kavi+swargaloka@sonder.ai        ← Kavi in Swargaloka
menaka+swargaloka@sonder.ai      ← Menaka in Swargaloka
```

One API key per service handles ALL agents.

#### Step 1: Resend (Outbound)

1. Sign up at [resend.com](https://resend.com)
2. Add your domain (Settings → Domains → Add Domain)
3. Add DNS records they provide
4. Get API key (API Keys → Create)

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_DOMAIN=sonder.ai
```

That's it. Agents can now send emails.

#### Step 2: Mailgun (Inbound Inbox)

1. Sign up at [mailgun.com](https://mailgun.com)
2. Add your domain (Sending → Domains → Add New Domain)
3. Add DNS records they provide
4. Set up inbound route:
   - Go to **Receiving** → **Create Route**
   - Match: `catch_all()` (or `match_recipient(".*@sonder.ai")`)
   - Action: `store()`
   - Click **Create Route**
5. Get API key (API Security → Add new key)

```bash
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=sonder.ai
```

Now agents can receive and browse their inbox.

#### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent sends proactive message                                    │
│                                                                 │
│   From: luna+wanderers-rest@sonder.ai                           │
│   To: user@gmail.com                                             │
│   Subject: "Thinking of you"                                     │
│                                                                 │
│   → Resend API (one key, any agent address)                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ User replies                                                     │
│                                                                 │
│   From: user@gmail.com                                           │
│   To: luna+wanderers-rest@sonder.ai                             │
│                                                                 │
│   → Mailgun receives, stores                                     │
│   → Agent queries inbox filtered by their address               │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Sonder's WhatsApp Number (Twilio)

#### Step 1: Create Twilio Account

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up with email
3. Verify your phone number
4. You get $15 free credits

#### Step 2: Get Credentials

1. Go to [Twilio Console](https://console.twilio.com/)
2. On the dashboard, find:
   - **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token**: Click to reveal, copy it

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Step 3: Set Up WhatsApp Sandbox (Development)

1. In Twilio Console, go to: **Messaging** → **Try it out** → **Send a WhatsApp message**
2. You'll see instructions like:
   ```
   Send "join <word>-<word>" to +1 415 523 8886
   ```
3. Send that message from YOUR phone to join the sandbox
4. Note the sandbox number

```bash
TWILIO_WHATSAPP_NUMBER=+14155238886
```

#### Step 4: Production Number (Optional, costs ~$1/month)

1. Go to: **Phone Numbers** → **Buy a Number**
2. Search for a number with SMS + Voice
3. Purchase it
4. Go to: **Messaging** → **WhatsApp Senders**
5. Click "Request to enable your number for WhatsApp"
6. Complete Facebook Business verification (takes 24-48 hours)
7. Once approved, use your number

```bash
TWILIO_WHATSAPP_NUMBER=+1234567890  # Your purchased number
```

**Costs:**
- Number: ~$1/month
- Per message: $0.005-0.05 depending on country

---

## Part 3: User's Integrations (Your Accounts)

These connect to YOUR accounts so agents can help you.

### 3.1 Google Calendar + Gmail (Your Account)

This lets agents:
- **READ your calendar** — Know when you're busy, upcoming events
- **CREATE events** — Schedule focus blocks, send invites
- **READ your email** — Know what needs attention, who's waiting
- **DRAFT emails** — Help you write responses (in YOUR drafts)

**Note:** This is separate from agent emails (Resend/Mailgun).
- Agent emails = agents send/receive AS themselves (`luna+play@sonder.ai`)
- User Gmail = agents help WITH your inbox (`you@gmail.com`)

#### Step 1: Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown (top left) → **New Project**
3. Name: `Sonder`
4. Click **Create**
5. Select your new project

#### Step 2: Enable APIs

1. Go to [APIs & Services → Library](https://console.cloud.google.com/apis/library)
2. Search and enable:
   - **Google Calendar API** → Click → **Enable**
   - **Gmail API** → Click → **Enable**

#### Step 3: Configure OAuth Consent Screen

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** → **Create**
3. Fill in:
   - App name: `Sonder`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. **Scopes** → **Add or Remove Scopes**
6. Add these scopes (search or paste):
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.compose
   https://www.googleapis.com/auth/gmail.send
   ```
7. Click **Update** → **Save and Continue**
8. **Test users** → **Add Users**
9. Add YOUR email (the one you'll use with Sonder)
10. Click **Save and Continue**

#### Step 4: Create OAuth Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Sonder`
5. **Authorized redirect URIs** → **Add URI**:
   ```
   http://localhost:3000/auth/google/callback
   ```
6. Click **Create**
7. A popup shows your credentials - **download JSON** or copy:
   - Client ID
   - Client Secret

```bash
GOOGLE_CLIENT_ID=1234567890-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

#### Step 5: First Authorization (happens when you run Sonder)

When Sonder first connects:
1. It opens a browser to Google
2. Sign in with YOUR account
3. Grant permissions
4. Google redirects back
5. Sonder stores tokens locally (encrypted)

---

### 3.2 Todoist (Your Tasks)

Simple API key - no OAuth needed.

1. Go to [todoist.com/prefs/integrations](https://todoist.com/prefs/integrations)
2. Scroll down to **Developer** section
3. Find **API token**
4. Copy the token

```bash
TODOIST_API_KEY=0123456789abcdef0123456789abcdef01234567
```

---

### 3.3 Your Contact Info (Where angels reach you)

```bash
# Your phone (for WhatsApp messages from angels)
USER_WHATSAPP=+15551234567

# Your email (for calendar invites, email drafts)
USER_EMAIL=you@gmail.com

# Your Telegram (automatically from chat)
# No config needed - determined by who messages the bot
```

---

## Part 4: How It All Works Together

### Calendar Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Menaka (Strategist) decides you need a focus block             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sonder creates calendar event:                                  │
│                                                                 │
│   Organizer: angels@sonder.app (SONDER'S email)                │
│   Attendee: you@gmail.com (YOUR email)                         │
│   Title: "🎯 Focus: Proposal Draft"                            │
│   Description: "Menaka scheduled this for you..."              │
│                                                                 │
│ Uses: Sonder's Google OAuth credentials                        │
│ Calendar: Sonder's calendar (creates event)                    │
│ You receive: Invite in YOUR inbox                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ You get email invite:                                           │
│                                                                 │
│   From: Sonder Angels <angels@sonder.app>                      │
│   To: you@gmail.com                                             │
│                                                                 │
│   🎯 Focus: Proposal Draft                                     │
│   When: Tuesday 2-4pm                                          │
│                                                                 │
│   [Accept] [Decline] [Maybe]                                   │
└─────────────────────────────────────────────────────────────────┘
```

### WhatsApp Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Urvashi (Spark) wants to nudge you about that task             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sonder sends WhatsApp via Twilio:                              │
│                                                                 │
│   From: +1-415-555-0123 (SONDER'S Twilio number)              │
│   To: +1-555-123-4567 (YOUR phone)                            │
│                                                                 │
│   ⚡ *Urvashi*                                                 │
│                                                                 │
│   That proposal has been waiting for 3 days.                   │
│   What if we just wrote the first sentence?                    │
│                                                                 │
│   _The Spark_                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Email Draft Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Chitralekha notices you haven't replied to Sarah               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sonder creates draft in YOUR Gmail:                            │
│                                                                 │
│   Uses: YOUR Google OAuth credentials                          │
│   Creates draft in: YOUR drafts folder                         │
│                                                                 │
│   Draft:                                                        │
│   To: sarah@company.com                                         │
│   Subject: Re: Project Update                                   │
│   Body: "Hey Sarah, thanks for the update..."                  │
│                                                                 │
│ Angels then message you:                                        │
│   "I drafted a reply to Sarah. Check your drafts?"             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete .env Example

```bash
# =============================================================================
# LLM PROVIDER (Required - pick one)
# =============================================================================
LLM_PROVIDER=kimi
KIMI_API_KEY=sk-xxxxxxxxxxxxxxxx
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
# OLLAMA_ENDPOINT=http://localhost:11434

# =============================================================================
# TELEGRAM BOT (Required)
# =============================================================================
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# =============================================================================
# AGENT EMAIL (Resend + Mailgun)
# =============================================================================

# Your domain for agent emails (e.g., sonder.ai)
EMAIL_DOMAIN=sonder.ai

# Resend - Outbound (agents send from agent+play@domain)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx

# Mailgun - Inbound (agents receive and browse inbox)
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=sonder.ai

# =============================================================================
# WHATSAPP (Twilio) - Optional
# =============================================================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886

# =============================================================================
# USER'S IDENTITY (Your accounts - agents help WITH these)
# =============================================================================

# Your Email (where agents reach you)
USER_EMAIL=you@gmail.com

# Your Phone (for WhatsApp)
USER_WHATSAPP=+15551234567

# Your Todoist (optional)
TODOIST_API_KEY=0123456789abcdef01234567

# =============================================================================
# USER'S GOOGLE (For reading YOUR calendar and inbox)
# =============================================================================
# Agents read your calendar (know when you're busy) and inbox (what needs attention)
GOOGLE_CLIENT_ID=1234567890-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# =============================================================================
# SETTINGS
# =============================================================================
PLAY=swargaloka
SAVE_PATH=~/.sonder/saves
LOG_LEVEL=info
DEV_MODE=true

# Quiet hours (agents won't message during these times)
QUIET_HOURS_START=22
QUIET_HOURS_END=8
TIMEZONE=America/Los_Angeles
```

---

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Redirect URI must match EXACTLY (including trailing slash)
- You must be a test user in OAuth consent screen
- Clear browser cookies and try again

### "Insufficient Permission" from Gmail/Calendar
- Re-authorize and make sure you check all the permission boxes
- Scopes may have changed - check OAuth consent screen

### Twilio "Unable to create record"
- For sandbox: you must join first with "join xxx-xxx"
- Phone number must include country code: `+1` not just `1`
- Check Twilio console for error details

### "Conflict: terminated by other getUpdates request" (Telegram)
- Another bot instance is running
- Kill it: `pkill -f "tsx src/telegram-bot"`

### WhatsApp messages not delivering
- Sandbox only works with numbers that joined
- Check Twilio logs for delivery status
- WhatsApp has 24-hour session windows

---

## Cost Summary

| Service | Free Tier | Paid |
|---------|-----------|------|
| Kimi LLM | - | ~$0.01/session |
| OpenAI | $5 credit | ~$0.01/session |
| Telegram | ✅ Free | - |
| Resend | 3,000 emails/mo | $20/mo for 50k |
| Mailgun | 5,000 emails/mo | $35/mo for 50k |
| Todoist | ✅ Free | - |
| Twilio WhatsApp | $15 credit | ~$0.01/msg |
| Google APIs | ✅ Free (quotas) | - |

**Typical monthly cost:** $0-10 for personal use (free tiers cover most usage)

---

## Next Steps

1. ✅ Set up LLM + Telegram (required)
2. Set up Resend + Mailgun (agent emails)
3. Set up Google OAuth (read your calendar + inbox)
4. Set up Twilio (for WhatsApp proactive messages)
5. Connect Todoist (task tracking)

Run:
```bash
pnpm telegram
```

Message your bot on Telegram to start!
