/**
 * PM2 Ecosystem Configuration
 *
 * Manages multiple Sonder services:
 * - Chorus bot (ADHD companion)
 * - Dashboard (web UI + API)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs
 *   pm2 restart all
 */

module.exports = {
  apps: [
    // -------------------------------------------------------------------------
    // Chorus Bot - Main ADHD companion
    // -------------------------------------------------------------------------
    {
      name: 'chorus',
      script: 'packages/engine/src/chorus-telegram-bot.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },

    // -------------------------------------------------------------------------
    // Dashboard - Web UI + API
    // -------------------------------------------------------------------------
    {
      name: 'dashboard',
      script: 'packages/dashboard/src/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Graceful shutdown
      kill_timeout: 5000,
    },

    // -------------------------------------------------------------------------
    // Wanderer's Rest Bot
    // -------------------------------------------------------------------------
    {
      name: 'wanderers-rest',
      script: 'packages/engine/src/wanderers-rest-telegram-bot.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
