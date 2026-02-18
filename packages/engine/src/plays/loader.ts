/**
 * Play Loader
 *
 * Loads and initializes enabled plays.
 * Each play gets its own bot instance for Telegram.
 */

import { Bot } from 'grammy';
import { PlayDefinition, playRegistry } from './registry.js';
import { getPlayConfig, PlayConfigManager } from './config.js';

// =============================================================================
// Types
// =============================================================================

export interface LoadedPlay {
  definition: PlayDefinition;
  telegramBot?: Bot;
  status: 'loaded' | 'error' | 'disabled';
  error?: string;
}

export interface PlayLoaderOptions {
  // Only load specific plays (overrides config)
  onlyPlays?: string[];

  // Skip Telegram bot initialization
  skipTelegram?: boolean;

  // Custom config manager
  configManager?: PlayConfigManager;
}

// =============================================================================
// Play Loader
// =============================================================================

export class PlayLoader {
  private loadedPlays: Map<string, LoadedPlay> = new Map();
  private config: PlayConfigManager;

  constructor(options: PlayLoaderOptions = {}) {
    this.config = options.configManager || getPlayConfig();
  }

  /**
   * Load all enabled plays
   */
  async loadAll(options: PlayLoaderOptions = {}): Promise<Map<string, LoadedPlay>> {
    const playsToLoad = options.onlyPlays
      ? options.onlyPlays.map(id => playRegistry.get(id)).filter((p): p is PlayDefinition => !!p)
      : this.config.getEnabledPlays();

    console.log(`[PlayLoader] Loading ${playsToLoad.length} play(s)...`);

    for (const play of playsToLoad) {
      await this.loadPlay(play, options);
    }

    return this.loadedPlays;
  }

  /**
   * Load a single play
   */
  async loadPlay(play: PlayDefinition, options: PlayLoaderOptions = {}): Promise<LoadedPlay> {
    console.log(`[PlayLoader] Loading: ${play.name}`);

    const loaded: LoadedPlay = {
      definition: play,
      status: 'loaded',
    };

    // Initialize Telegram bot if configured
    if (!options.skipTelegram && play.channels.telegram) {
      const tokenEnvVar = play.channels.telegram.botTokenEnvVar;
      const token = process.env[tokenEnvVar];

      if (token) {
        try {
          loaded.telegramBot = new Bot(token);
          console.log(`[PlayLoader] ✓ Telegram bot initialized for ${play.name}`);
        } catch (error) {
          loaded.status = 'error';
          loaded.error = `Failed to initialize Telegram bot: ${error}`;
          console.error(`[PlayLoader] ✗ ${loaded.error}`);
        }
      } else {
        console.log(`[PlayLoader] ⚠ No ${tokenEnvVar} found, skipping Telegram for ${play.name}`);
      }
    }

    this.loadedPlays.set(play.id, loaded);
    return loaded;
  }

  /**
   * Get a loaded play
   */
  getPlay(playId: string): LoadedPlay | undefined {
    return this.loadedPlays.get(playId);
  }

  /**
   * Get all loaded plays
   */
  getAllLoaded(): LoadedPlay[] {
    return Array.from(this.loadedPlays.values());
  }

  /**
   * Get plays that loaded successfully
   */
  getSuccessfullyLoaded(): LoadedPlay[] {
    return this.getAllLoaded().filter(p => p.status === 'loaded');
  }

  /**
   * Start all Telegram bots
   */
  async startAllBots(): Promise<void> {
    const plays = this.getSuccessfullyLoaded();

    for (const play of plays) {
      if (play.telegramBot) {
        console.log(`[PlayLoader] Starting bot for ${play.definition.name}...`);

        // Note: Actual message handlers would be set up by each play
        // This just starts the bot polling
        play.telegramBot.catch((err) => {
          console.error(`[${play.definition.name}] Bot error:`, err);
        });

        // Don't await - let bots run concurrently
        play.telegramBot.start({
          onStart: (botInfo) => {
            console.log(`[PlayLoader] ✓ ${play.definition.name} bot running as @${botInfo.username}`);
          },
        });
      }
    }
  }

  /**
   * Stop all bots
   */
  async stopAllBots(): Promise<void> {
    const plays = this.getAllLoaded();

    for (const play of plays) {
      if (play.telegramBot) {
        console.log(`[PlayLoader] Stopping bot for ${play.definition.name}...`);
        await play.telegramBot.stop();
      }
    }
  }

  /**
   * Check if any plays have WhatsApp enabled
   */
  hasWhatsAppEnabled(): boolean {
    return this.getSuccessfullyLoaded().some(
      p => p.definition.channels.whatsapp?.enabled &&
           this.config.isChannelEnabled(p.definition.id, 'whatsapp')
    );
  }

  /**
   * Check if any plays have Email enabled
   */
  hasEmailEnabled(): boolean {
    return this.getSuccessfullyLoaded().some(
      p => p.definition.channels.email?.enabled &&
           this.config.isChannelEnabled(p.definition.id, 'email')
    );
  }

  /**
   * Get plays that use shared WhatsApp
   */
  getWhatsAppPlays(): LoadedPlay[] {
    return this.getSuccessfullyLoaded().filter(
      p => p.definition.channels.whatsapp?.enabled &&
           this.config.isChannelEnabled(p.definition.id, 'whatsapp')
    );
  }

  /**
   * Format a message with play/agent identification (for shared channels)
   */
  formatSharedChannelMessage(
    playId: string,
    agentId: string,
    content: string,
    channel: 'whatsapp' | 'email'
  ): { formatted: string; fromName?: string } {
    const play = playRegistry.get(playId);
    if (!play) {
      return { formatted: content };
    }

    const agent = play.agents.find(a => a.id === agentId);
    const prefix = channel === 'whatsapp'
      ? play.channels.whatsapp?.messagePrefix || ''
      : '';

    const agentName = agent?.name || agentId;
    const agentEmoji = agent?.emoji || '';

    if (channel === 'whatsapp') {
      // WhatsApp format: ✨ Chitralekha (Swargaloka)
      // Message content here
      const header = `${prefix} *${agentName}* _(${play.name})_\n`;
      return { formatted: `${header}\n${content}` };
    } else {
      // Email: From name includes agent and play
      return {
        formatted: content,
        fromName: `${agentName} via ${play.name}`,
      };
    }
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _loader: PlayLoader | null = null;

export function getPlayLoader(): PlayLoader {
  if (!_loader) {
    _loader = new PlayLoader();
  }
  return _loader;
}
