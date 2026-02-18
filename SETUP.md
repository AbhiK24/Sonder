# Sonder Setup Guide

Complete guide to setting up Sonder with all integrations.

---

## Quick Start

```bash
# Clone
git clone https://github.com/AbhiK24/Sonder.git
cd Sonder && pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials (see below)
nano .env

# Run
pnpm telegram
```

---

## Core Setup

### 1. LLM Provider (Required)

Choose one:

#### Option A: Kimi (Moonshot) — Recommended for cost
```bash
# Get API key: https://platform.moonshot.cn/
KIMI_API_KEY=sk-...
LLM_PROVIDER=kimi
```

#### Option B: OpenAI
```bash
# Get API key: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
```

#### Option C: Anthropic
```bash
# Get API key: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
```

#### Option D: Ollama (Free, Local)
```bash
# Install: https://ollama.ai
# Pull a model: ollama pull qwen2.5:14b
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b
LLM_PROVIDER=ollama
```

### 2. Telegram Bot (Required for chat)

1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g., "Sonder Angels")
4. Choose a username (e.g., "SonderAngelsBot")
5. Copy the token

```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

## Integration Setup

### Google Calendar + Gmail

Both use the same Google OAuth credentials.

#### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Sonder")
3. Enable APIs:
   - [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   - [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

#### Step 2: Configure OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Choose "External" (or "Internal" if using Google Workspace)
3. Fill in:
   - App name: "Sonder"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.send`
5. Add test users (your email) while in testing mode

#### Step 3: Create OAuth Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"
4. Add redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Client Secret

```bash
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

#### Step 4: First-time Authorization

When you first connect, Sonder will:
1. Open a browser to Google's consent screen
2. You grant permissions
3. Google redirects back with a code
4. Sonder exchanges the code for tokens
5. Tokens are stored locally (encrypted)

---

### Todoist

Simple API key authentication.

#### Get API Token

1. Go to [Todoist Settings](https://todoist.com/prefs/integrations)
2. Scroll to "API token"
3. Copy the token

```bash
TODOIST_API_KEY=0123456789abcdef0123456789abcdef01234567
```

---

### WhatsApp (Twilio)

Twilio provides WhatsApp Business API access.

#### Step 1: Create Twilio Account

1. Sign up at [Twilio](https://www.twilio.com/try-twilio)
2. Verify your phone number
3. Get free trial credits ($15)

#### Step 2: Get WhatsApp Sandbox (Development)

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to Messaging → Try it out → Send a WhatsApp message
3. Follow instructions to join the sandbox:
   - Send "join <sandbox-code>" to the Twilio number
4. Note the sandbox number (e.g., +14155238886)

#### Step 3: Get Account Credentials

1. Go to [Account Dashboard](https://console.twilio.com/)
2. Find "Account SID" and "Auth Token"

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886
```

#### Step 4: Production Setup (Optional)

For production, you'll need a WhatsApp Business number:

1. Go to [Twilio WhatsApp Senders](https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders)
2. Click "Request to enable your number"
3. Complete Facebook Business verification
4. Wait for approval (24-48 hours)
5. Update `TWILIO_WHATSAPP_NUMBER` with your number

**Costs:**
- Twilio: ~$0.005 per message (US)
- WhatsApp: ~$0.005-0.05 per conversation (varies by country)

---

## Sonder's Own Identity

For angels to message users, Sonder needs its own phone number and email.

### Option A: Development (Free)

Use Twilio Sandbox for WhatsApp + your personal Gmail:

```bash
# WhatsApp: Twilio Sandbox
TWILIO_WHATSAPP_NUMBER=+14155238886  # Sandbox number

# Email: Your Gmail (messages show "via Gmail")
# Use Gmail API with your account
GOOGLE_CLIENT_ID=...  # Same as above
```

### Option B: Production (Recommended)

**WhatsApp:**
- Get a Twilio number (~$1/month + per-message)
- Or use WhatsApp Business API directly

**Email:**
- Option 1: Custom domain with SendGrid
  - `angels@yourdomain.com`
  - Free tier: 100 emails/day
- Option 2: Google Workspace
  - `chitralekha@yourdomain.com` (alias)
  - All aliases route to one inbox

**Example production setup:**
```bash
# WhatsApp
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_NUMBER=+1234567890  # Your dedicated number

# Email (SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxx
SONDER_EMAIL=angels@yourdomain.com
SONDER_EMAIL_FROM_NAME=Sonder Angels
```

---

## Multi-Agent Messaging

All angels use the same phone number and email, but messages are personalized:

### WhatsApp Example

```
📜 *Chitralekha*

You mentioned wanting to call your mom this week.
Today might be a good day - your calendar looks light after 3pm.

_The Rememberer_
```

### Email Example

```
From: Urvashi (via Sonder) <angels@sonder.app>
Subject: ⚡ Ready to tackle that proposal?

Hey!

I noticed you've been circling that proposal for a few days.
What if we just started with the first paragraph?

Sometimes getting one sentence down breaks the whole thing open.

—
⚡ Urvashi
The Spark
```

### How it Works

1. User has ONE conversation with Sonder
2. Different angels "speak" via message formatting
3. Angels know who spoke last (context preserved)
4. User can reply naturally; system routes to appropriate angel

---

## Environment Variables Reference

```bash
# =============================================================================
# LLM Provider (Required)
# =============================================================================
LLM_PROVIDER=kimi                    # ollama | openai | anthropic | kimi
KIMI_API_KEY=sk-...                  # If using Kimi
OPENAI_API_KEY=sk-...                # If using OpenAI
ANTHROPIC_API_KEY=sk-ant-...         # If using Anthropic
OLLAMA_ENDPOINT=http://localhost:11434  # If using Ollama

# =============================================================================
# Chat Platform (Required)
# =============================================================================
TELEGRAM_BOT_TOKEN=...               # From @BotFather

# =============================================================================
# Google (Calendar + Gmail)
# =============================================================================
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# =============================================================================
# Todoist
# =============================================================================
TODOIST_API_KEY=...

# =============================================================================
# WhatsApp (Twilio)
# =============================================================================
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+1...

# =============================================================================
# Email (SendGrid) - Optional, for production
# =============================================================================
SENDGRID_API_KEY=SG....
SONDER_EMAIL=angels@yourdomain.com

# =============================================================================
# Settings
# =============================================================================
SOUL=wanderers-rest                  # Or: swargaloka
SAVE_PATH=~/.sonder/saves
LOG_LEVEL=info
DEV_MODE=true
```

---

## Troubleshooting

### Google OAuth: "Access blocked: This app's request is invalid"
- Check redirect URI matches exactly
- Ensure you're using a test user email
- Try clearing browser cookies

### Twilio: "Unable to create record"
- For sandbox: make sure you joined with "join <code>"
- Check phone number format includes country code
- Verify account has credits

### Telegram: "Conflict: terminated by other getUpdates request"
- Another bot instance is running
- Kill it: `pkill -f "tsx src/telegram-bot.ts"`

### Gmail: "Insufficient Permission"
- Re-authorize with all required scopes
- Check OAuth consent screen has the scopes listed

---

## Security Notes

1. **Never commit `.env`** — It's in `.gitignore`
2. **Tokens are stored locally** — In `~/.sonder/` (encrypted)
3. **OAuth tokens expire** — Auto-refresh is implemented
4. **Twilio is metered** — Set up billing alerts
5. **Google has quotas** — Free tier is generous but limited

---

## Next Steps

1. Set up core requirements (LLM + Telegram)
2. Add integrations as needed
3. Run `pnpm telegram` to start
4. Message your bot on Telegram

For the Angels experience (Swargaloka), you'll also want:
- WhatsApp (for proactive messages)
- Google Calendar (so angels know your schedule)
- Todoist (so angels can track tasks with you)
