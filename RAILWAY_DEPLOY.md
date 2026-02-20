# Deploying Sonder to Railway

Complete guide to deploy Sonder (Chorus bot) to Railway with WhatsApp support.

## Prerequisites

- [Railway account](https://railway.app)
- GitHub repo connected to Railway
- Telegram bot token (from @BotFather)
- API keys ready (Kimi, Resend, Google OAuth, etc.)

---

## Step 1: Create Railway Project (IMPORTANT)

Railway may auto-detect multiple services from the monorepo. **You only need ONE service.**

### Option A: Single Service (Recommended)

1. Go to [railway.app](https://railway.app) → **New Project** → **Empty Project**
2. Click **+ New** → **GitHub Repo**
3. Select your Sonder repository
4. **Important:** If Railway shows multiple services (engine, dashboard, wanderers-rest), delete them all
5. Add a single service pointing to the **root** of the repo
6. It will use the root `Dockerfile` which runs PM2 with all apps

### Option B: If Auto-Detection Created Multiple Services

1. Delete all auto-detected services
2. Click **+ New** → **GitHub Repo** → Select Sonder
3. In service settings, ensure:
   - **Root Directory:** `/` (empty/root)
   - **Builder:** Dockerfile
   - **Dockerfile Path:** `Dockerfile`

The root Dockerfile runs PM2 which manages:
- Chorus bot (ADHD companion)
- Dashboard (health check + API)
- Wanderer's Rest bot (optional game)

---

## Step 2: Add Persistent Volume

**Critical for WhatsApp to work!**

1. In your Railway project, click **+ New** → **Volume**
2. Name it: `sonder-data`
3. Mount path: `/home/sonder/.sonder`
4. Attach to your service

This stores:
- WhatsApp auth session (Baileys)
- User saves
- Reminders
- Memory

---

## Step 3: Configure Environment Variables

In Railway → Service → Variables, add:

### Required - LLM Provider
```
LLM_PROVIDER=kimi
KIMI_API_KEY=sk-your-kimi-key
KIMI_MODEL=kimi-k2-0711-preview
```

### Required - Telegram
```
CHORUS_TELEGRAM_BOT_TOKEN=your-bot-token
```

### Required - Basic Settings
```
NODE_ENV=production
TIMEZONE=Asia/Kolkata
SAVE_PATH=/home/sonder/.sonder/saves
SONDER_CONFIG_DIR=/home/sonder/.sonder
LOG_LEVEL=info
PORT=3000
```

### For Email (Resend)
```
RESEND_API_KEY=re_your-key
SONDER_EMAIL_DOMAIN=yourdomain.com
USER_EMAIL=your@email.com
```

### For Google Calendar/Gmail
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_EMAIL=your@gmail.com
```

### For WhatsApp (Baileys - FREE)
```
WHATSAPP_USE_BAILEYS=true
USER_WHATSAPP=+919876543210
WHATSAPP_ALLOWLIST=+919876543210,+919123456789
WHATSAPP_RATE_LIMIT=20
```

### Quiet Hours & Check-ins
```
QUIET_HOURS_START=22
QUIET_HOURS_END=8
MORNING_CHECKIN_HOUR=9
EVENING_CHECKIN_HOUR=21
```

---

## Step 4: Deploy

1. Push to your GitHub repo (or click Deploy in Railway)
2. Railway will build using the Dockerfile
3. Wait for deployment to complete (~3-5 minutes)

---

## Step 5: WhatsApp QR Setup (First Time Only)

**This is the tricky part.** Baileys needs a one-time QR scan.

### Option A: Use Railway Logs (Easiest)

1. In Railway → Service → Logs
2. Look for the QR code output (ASCII art)
3. Scan with WhatsApp (Settings → Linked Devices → Link a Device)
4. Once linked, the session persists in the volume

### Option B: Railway Shell

1. Click on your service → **Shell** tab
2. Run: `cat /home/sonder/.sonder/whatsapp-auth/qr.txt`
3. Or check logs: `pm2 logs chorus`

### Option C: Pre-authenticate Locally

1. Run Sonder locally first: `pnpm chorus`
2. Scan the QR code locally
3. Copy the auth folder:
   ```bash
   # On local machine
   tar -czvf whatsapp-auth.tar.gz ~/.sonder/whatsapp-auth/
   ```
4. Upload to Railway using their CLI or shell
5. Extract to `/home/sonder/.sonder/whatsapp-auth/`

**Note:** If you see `[WhatsApp] Logged out. Delete auth folder and re-scan QR.` in logs, the session expired. Re-scan QR.

---

## Step 6: Verify Deployment

1. **Check Logs:**
   ```
   ✓ LLM Provider: kimi
   [Chorus] Email (Resend) connected
   [Chorus] WhatsApp (Baileys) initializing
   ✓ Engine context started
   ✓ @SonderChorusBot is running!
   ```

2. **Test in Telegram:**
   - Send a message to your bot
   - Try: "Remind me to test in 2 minutes"
   - Try: "What's on my calendar today?"

3. **Health Check:**
   - Visit: `https://your-app.railway.app/health`
   - Should return: `{"status":"ok"}`

---

## WhatsApp Troubleshooting

### "Connection Failure" or 401 Error
```
[WhatsApp] Disconnected. Status: 401
[WhatsApp] Logged out. Delete auth folder and re-scan QR.
```

**Fix:**
1. Railway Shell: `rm -rf /home/sonder/.sonder/whatsapp-auth/*`
2. Restart the service
3. Scan new QR code from logs

### QR Code Not Appearing
- Check if `WHATSAPP_USE_BAILEYS=true` is set
- Restart the service
- Check logs for errors

### Session Keeps Expiring
- WhatsApp Web sessions can expire after ~14 days of inactivity
- Keep the bot active by sending messages periodically
- The volume ensures session persists across deploys

---

## Memory/Embeddings (Optional)

By default, semantic memory requires Ollama (local LLM). On Railway, you have options:

### Option 1: Skip Memory (Simplest)
Memory gracefully degrades if Ollama unavailable. You'll see:
```
⚠ Memory disabled (Ollama not available)
```
Bot works fine, just without semantic recall.

### Option 2: Add Ollama Service
1. Create another Railway service
2. Use Docker image: `ollama/ollama`
3. Add volume for models
4. Set in Sonder:
   ```
   OLLAMA_ENDPOINT=http://ollama-service:11434
   OLLAMA_MODEL=nomic-embed-text
   ```

---

## Railway.toml (Already Configured)

The repo includes `railway.toml`:
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

---

## Cost Estimate

Railway Hobby Plan ($5/month):
- 512MB RAM (enough for Sonder)
- 1GB disk (Volume storage)
- Always-on

Usage Plan (pay-as-you-go):
- ~$2-5/month for a small bot
- Memory: ~300-500MB
- CPU: Minimal (mostly idle, spikes on LLM calls)

---

## Quick Commands (Railway CLI)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up

# View logs
railway logs

# Open shell
railway shell

# Set env var
railway variables set KEY=value
```

---

## Updating Sonder

1. Push changes to GitHub
2. Railway auto-deploys (if connected)
3. Or manually: Railway → Service → Deploy

Your volume data persists across deploys!

---

## Support

- Railway Docs: https://docs.railway.app
- Sonder Issues: https://github.com/AbhiK24/Sonder/issues
