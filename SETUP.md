# Sonder Setup Guide

Complete guide to setting up Sonder with all integrations.

---

## Understanding the Two Identities

Sonder uses **two separate identities**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         SONDER (System)                         │
│                                                                 │
│  Email: angels@yourdomain.com (or sonder.angels@gmail.com)     │
│  WhatsApp: +1-415-555-0123 (Twilio number)                     │
│  Telegram: @SonderAngelsBot                                     │
│                                                                 │
│  → This is WHO SENDS messages/invites                          │
│  → Angels speak through this identity                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ sends to
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          USER (You)                             │
│                                                                 │
│  Email: you@gmail.com (your personal email)                    │
│  WhatsApp: +1-555-123-4567 (your phone)                        │
│  Telegram: your chat with @SonderAngelsBot                     │
│  Calendar: your Google Calendar                                 │
│                                                                 │
│  → This is WHO RECEIVES messages/invites                       │
│  → Your calendar, your tasks, your inbox                       │
└─────────────────────────────────────────────────────────────────┘
```

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

### 2.1 Sonder's Email (For sending invites/messages)

#### Option A: Free Gmail Account (Easiest)

1. Create a new Gmail: `sonder.angels.yourname@gmail.com`
2. This is Sonder's email - angels send FROM here
3. See Section 3.1 for OAuth setup

```bash
SONDER_EMAIL=sonder.angels.yourname@gmail.com
```

#### Option B: Custom Domain (Professional)

1. Get a domain (e.g., `yourdomain.com`)
2. Set up email with:
   - Google Workspace ($6/mo)
   - Zoho Mail (free tier)
   - Fastmail
3. Create: `angels@yourdomain.com`

```bash
SONDER_EMAIL=angels@yourdomain.com
```

#### Option C: SendGrid (For high volume)

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Verify a sender email or domain
3. Create API key

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxx
SONDER_EMAIL=angels@yourdomain.com
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

These connect to YOUR accounts so angels can help you.

### 3.1 Google Calendar + Gmail (Your Account)

Angels need to:
- READ your calendar (know when you're busy)
- CREATE events (schedule focus blocks, send invites)
- READ email subjects (know what needs attention)
- DRAFT emails (help you write responses)

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
# SONDER'S IDENTITY (System accounts - sends FROM these)
# =============================================================================

# Sonder's Email (for sending calendar invites)
SONDER_EMAIL=sonder.angels.yourname@gmail.com

# Sonder's Google OAuth (for Sonder's own calendar)
SONDER_GOOGLE_CLIENT_ID=1234567890-xxxxx.apps.googleusercontent.com
SONDER_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
SONDER_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/sonder/callback

# Sonder's WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886

# =============================================================================
# USER'S IDENTITY (Your accounts - angels help WITH these)
# =============================================================================

# Your Email
USER_EMAIL=you@gmail.com

# Your Phone (for WhatsApp)
USER_WHATSAPP=+15551234567

# Your Google OAuth (for YOUR calendar and gmail)
USER_GOOGLE_CLIENT_ID=1234567890-xxxxx.apps.googleusercontent.com
USER_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
USER_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/user/callback

# Your Todoist
TODOIST_API_KEY=0123456789abcdef01234567

# =============================================================================
# SETTINGS
# =============================================================================
SOUL=swargaloka
SAVE_PATH=~/.sonder/saves
LOG_LEVEL=info
DEV_MODE=true

# Quiet hours (angels won't message during these times)
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
| Google APIs | ✅ Free (quotas) | - |
| Todoist | ✅ Free | - |
| Twilio WhatsApp | $15 credit | ~$0.01/msg |

**Typical monthly cost:** $0-5 for personal use

---

## Next Steps

1. ✅ Set up LLM + Telegram (required)
2. Set up Sonder's email (for calendar invites)
3. Set up Twilio (for WhatsApp proactive messages)
4. Connect your Google (calendar + gmail access)
5. Connect Todoist (task tracking)

Run:
```bash
pnpm telegram
```

Message your bot on Telegram to start!
