# Sonder Deployment Guide

Deploy Sonder to cloud platforms for 24/7 availability.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Railway (Recommended)](#railway-recommended)
- [AWS EC2](#aws-ec2)
- [Docker Compose](#docker-compose)
- [DigitalOcean](#digitalocean)
- [Fly.io](#flyio)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

1. **Telegram Bot Token** - Get from [@BotFather](https://t.me/botfather)
2. **LLM API Key** - One of:
   - Kimi (Moonshot): https://moonshot.ai
   - OpenAI: https://platform.openai.com
   - Anthropic: https://console.anthropic.com
3. **Git repository** - Code pushed to GitHub/GitLab

---

## Environment Variables

Create a `.env` file or set these in your cloud provider:

```bash
# Required
LLM_PROVIDER=kimi                    # kimi | openai | anthropic | ollama
KIMI_API_KEY=sk-xxx                  # Your LLM API key
CHORUS_TELEGRAM_BOT_TOKEN=xxx        # Telegram bot token
TIMEZONE=Asia/Kolkata                # Your timezone

# Optional - WhatsApp (Baileys)
WHATSAPP_USE_BAILEYS=true
USER_WHATSAPP=+1234567890
WHATSAPP_ALLOWLIST=+1234567890       # Comma-separated

# Optional - Email (Resend)
RESEND_API_KEY=re_xxx
USER_EMAIL=you@example.com
SONDER_EMAIL_DOMAIN=yourdomain.com

# Optional - Calendar
ICS_FEEDS=[{"id":"cal-1","name":"Personal","url":"https://..."}]

# System
NODE_ENV=production
SAVE_PATH=/home/sonder/.sonder/saves
```

---

## Railway (Recommended)

Railway offers the easiest deployment with automatic builds and persistent storage.

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/sonder)

### Manual Setup

1. **Create Railway Account**
   ```
   https://railway.app
   ```

2. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

3. **Create Project**
   ```bash
   cd /path/to/sonder
   railway init
   ```

4. **Set Environment Variables**
   ```bash
   # Required
   railway variables set LLM_PROVIDER=kimi
   railway variables set KIMI_API_KEY=sk-xxx
   railway variables set CHORUS_TELEGRAM_BOT_TOKEN=xxx
   railway variables set TIMEZONE=Asia/Kolkata

   # System
   railway variables set NODE_ENV=production
   railway variables set SAVE_PATH=/home/sonder/.sonder/saves
   ```

5. **Add Persistent Volume**
   - Go to Railway Dashboard → Your Project → Settings
   - Add Volume: Mount path `/home/sonder/.sonder`

6. **Deploy**
   ```bash
   railway up
   ```

7. **View Logs**
   ```bash
   railway logs
   ```

### Railway Costs

- **Hobby Plan**: $5/month (500 hours)
- **Pro Plan**: Pay per use (~$5-15/month for Sonder)

---

## AWS EC2

### 1. Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose:
   - **AMI**: Amazon Linux 2023 or Ubuntu 22.04
   - **Instance Type**: t3.micro (free tier) or t3.small
   - **Storage**: 20GB gp3
3. Configure Security Group:
   - SSH (22): Your IP
   - HTTP (3000): Anywhere (for dashboard)

### 2. Connect to Instance

```bash
ssh -i your-key.pem ec2-user@your-instance-ip
```

### 3. Install Dependencies

```bash
# Update system
sudo yum update -y  # Amazon Linux
# OR
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs  # Amazon Linux
# OR
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs  # Ubuntu

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2

# Install git
sudo yum install -y git  # Amazon Linux
# OR
sudo apt install -y git  # Ubuntu
```

### 4. Clone & Setup

```bash
# Clone repository
git clone https://github.com/yourusername/sonder.git
cd sonder

# Install dependencies
pnpm install

# Build
pnpm build

# Create data directory
mkdir -p ~/.sonder/saves
```

### 5. Configure Environment

```bash
# Copy example env
cp .env.example .env

# Edit with your values
nano .env
```

### 6. Start with PM2

```bash
# Start all services
pm2 start ecosystem.config.cjs

# Save PM2 config (survives reboot)
pm2 save
pm2 startup
```

### 7. Setup Auto-Start on Boot

```bash
# Generate startup script
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Run the command it outputs, then:
pm2 save
```

### 8. Optional: Setup Nginx Reverse Proxy

```bash
sudo yum install -y nginx  # Amazon Linux
# OR
sudo apt install -y nginx  # Ubuntu

sudo nano /etc/nginx/conf.d/sonder.conf
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo systemctl restart nginx
```

### AWS Costs

- **t3.micro**: Free tier (750 hrs/month first year), then ~$8/month
- **t3.small**: ~$15/month

---

## Docker Compose

For self-hosted servers or local deployment.

### 1. Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Configure

```bash
cd sonder
cp .env.example .env
nano .env  # Add your API keys
```

### 3. Build & Run

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 4. Persistent Data

Data is stored in Docker volumes:
- `sonder-data`: Game saves and config
- `whatsapp-auth`: WhatsApp session (if using Baileys)

To backup:
```bash
docker run --rm -v sonder-data:/data -v $(pwd):/backup alpine tar czf /backup/sonder-backup.tar.gz /data
```

---

## DigitalOcean

### App Platform (Easy)

1. Fork the repository to your GitHub
2. Go to DigitalOcean → Create → Apps
3. Connect GitHub and select the repository
4. Configure:
   - **Type**: Web Service
   - **Dockerfile Path**: `/Dockerfile`
   - **HTTP Port**: 3000
5. Add Environment Variables
6. Deploy

### Droplet (Manual)

Same as AWS EC2 instructions, but:

1. Create Droplet (Basic, $6/month)
2. Choose Ubuntu 22.04
3. SSH in and follow EC2 steps 3-7

---

## Fly.io

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Create fly.toml

```toml
app = "sonder"
primary_region = "sin"  # Singapore (or your nearest)

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true

[mounts]
  source = "sonder_data"
  destination = "/home/sonder/.sonder"
```

### 3. Create Volume

```bash
fly volumes create sonder_data --region sin --size 1
```

### 4. Set Secrets

```bash
fly secrets set LLM_PROVIDER=kimi
fly secrets set KIMI_API_KEY=sk-xxx
fly secrets set CHORUS_TELEGRAM_BOT_TOKEN=xxx
fly secrets set TIMEZONE=Asia/Kolkata
```

### 5. Deploy

```bash
fly deploy
```

---

## Troubleshooting

### Bot not responding

1. Check logs:
   ```bash
   # Railway
   railway logs

   # PM2
   pm2 logs

   # Docker
   docker-compose logs -f
   ```

2. Verify Telegram token:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getMe
   ```

### WhatsApp not connecting

WhatsApp (Baileys) requires:
1. Persistent storage for auth session
2. First-time QR code scan

For cloud deployment, you may need to:
1. Run locally first to authenticate
2. Copy `~/.sonder/whatsapp-auth/` to the server

### Memory issues

Increase container memory or use a larger instance:
```bash
# Railway: Settings → Resources → Memory
# Docker: docker-compose.yml → mem_limit
# AWS: Use t3.small instead of t3.micro
```

### Saves not persisting

Ensure volumes are mounted:
```bash
# Check volume
docker volume ls

# Verify mount
docker exec sonder ls -la /home/sonder/.sonder/saves
```

---

## Updating

Sonder includes an auto-update script that handles everything.

### Quick Update (All Platforms)

```bash
# Check for updates
pnpm update:check

# Update to latest version
pnpm update
```

Or run directly:
```bash
./scripts/update.sh           # Update and restart
./scripts/update.sh --check   # Check only
./scripts/update.sh --force   # Force update
```

The update script will:
1. Check for new commits
2. Stash any local changes
3. Stop running services
4. Pull latest code
5. Install dependencies
6. Rebuild
7. Restart services

### Railway

Railway auto-deploys when you push:
```bash
git push origin main
```

Or trigger manually in Railway Dashboard → Deployments → Redeploy.

### Docker

```bash
docker-compose down
git pull
docker-compose build --no-cache
docker-compose up -d
```

### Automatic Updates (Cron)

To check for updates daily:
```bash
# Edit crontab
crontab -e

# Add (checks at 3am, notifies if update available)
0 3 * * * cd /path/to/sonder && ./scripts/update.sh --check >> /var/log/sonder-update.log 2>&1
```

For automatic updates (use with caution):
```bash
0 3 * * * cd /path/to/sonder && ./scripts/update.sh >> /var/log/sonder-update.log 2>&1
```

---

## Cost Comparison

| Platform       | Min Cost   | Best For                    |
|----------------|------------|------------------------------|
| Railway        | $5/month   | Easiest setup, auto-scaling |
| Fly.io         | $0-5/month | Edge deployment, free tier  |
| DigitalOcean   | $6/month   | Simple VPS, predictable     |
| AWS EC2        | $0-15/month| Free tier, enterprise       |
| Self-hosted    | $0         | Full control, existing HW   |

---

## Support

- GitHub Issues: https://github.com/AbhiK24/Sonder/issues
- Documentation: See SETUP.md for local development
