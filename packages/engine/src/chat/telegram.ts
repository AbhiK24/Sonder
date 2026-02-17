/**
 * Telegram Bot Integration
 *
 * Uses grammY for Telegram bot functionality.
 */

import { Bot, Context } from 'grammy';
import type { GameController } from '../core/game-controller.js';

export interface TelegramBotOptions {
  token: string;
  gameController: GameController;
}

export class TelegramBot {
  private bot: Bot;
  private gameController: GameController;

  constructor(options: TelegramBotOptions) {
    this.bot = new Bot(options.token);
    this.gameController = options.gameController;

    this.setupHandlers();
  }

  /**
   * Set up message handlers
   */
  private setupHandlers(): void {
    // Start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `Welcome to Wanderer's Rest.\n\n` +
        `The tavern door creaks as you push it open.\n` +
        `Firelight. The smell of woodsmoke and old ale.\n\n` +
        `A woman behind the bar looks up. Doesn't smile.\n\n` +
        `"New owner, is it? Maren. I run this place."\n\n` +
        `What do you say?`
      );
    });

    // Look command
    this.bot.command('look', async (ctx) => {
      const messages = await this.gameController.handleInput('look around');
      for (const msg of messages) {
        await ctx.reply(msg.content);
      }
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      const messages = await this.gameController.handleInput('what is my status');
      for (const msg of messages) {
        await ctx.reply(msg.content);
      }
    });

    // Handle all text messages
    this.bot.on('message:text', async (ctx) => {
      const input = ctx.message.text;

      // Skip commands
      if (input.startsWith('/')) return;

      try {
        const messages = await this.gameController.handleInput(input);

        for (const msg of messages) {
          await ctx.reply(this.formatMessage(msg));
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await ctx.reply('Something went wrong. The tavern shimmers for a moment.');
      }
    });
  }

  /**
   * Format message for Telegram
   */
  private formatMessage(msg: { speaker: string; content: string; npcId?: string }): string {
    switch (msg.speaker) {
      case 'npc':
        return msg.content; // NPC dialogue already formatted
      case 'tavern':
        return msg.content; // Tavern voice
      case 'gut':
        return msg.content; // Gut voice
      default:
        return msg.content;
    }
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    console.log('Starting Telegram bot...');
    await this.bot.start();
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    await this.bot.stop();
  }

  /**
   * Send notification to player
   */
  async sendNotification(chatId: number, message: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, message);
  }
}
