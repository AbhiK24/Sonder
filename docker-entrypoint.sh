#!/bin/sh
set -e

# Create directories if they don't exist (volume might be empty)
mkdir -p /root/.sonder/saves
mkdir -p /root/.sonder/reminders
mkdir -p /root/.sonder/whatsapp-auth
mkdir -p /root/.sonder/memory

# Start PM2
exec pm2-runtime ecosystem.config.cjs
