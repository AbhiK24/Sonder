/**
 * Play Configuration
 *
 * Manages which plays are enabled/disabled.
 * Persists user preferences locally.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { playRegistry, PlayDefinition } from './registry.js';

// =============================================================================
// Types
// =============================================================================

export interface PlayConfig {
  // Which plays are enabled
  enabledPlays: string[];

  // Per-play settings
  playSettings: Record<string, PlaySettings>;

  // Global settings
  global: GlobalSettings;
}

export interface PlaySettings {
  // Channel preferences for this play
  channels: {
    telegram: boolean;
    whatsapp: boolean;
    email: boolean;
  };

  // Quiet hours (override global)
  quietHours?: {
    start: number;  // 24h format
    end: number;
  };

  // Message frequency
  proactiveFrequency: 'low' | 'medium' | 'high';
}

export interface GlobalSettings {
  // Default quiet hours
  quietHours: {
    start: number;
    end: number;
  };
  timezone: string;

  // Which channel to prefer for proactive messages
  preferredChannel: 'telegram' | 'whatsapp' | 'email';
}

// =============================================================================
// Default Config
// =============================================================================

const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  channels: {
    telegram: true,
    whatsapp: false,
    email: false,
  },
  proactiveFrequency: 'medium',
};

const DEFAULT_CONFIG: PlayConfig = {
  enabledPlays: ['wanderers-rest'],  // Start with just the mystery game
  playSettings: {},
  global: {
    quietHours: {
      start: 22,  // 10pm
      end: 8,     // 8am
    },
    timezone: 'America/Los_Angeles',
    preferredChannel: 'telegram',
  },
};

// =============================================================================
// Config Manager
// =============================================================================

export class PlayConfigManager {
  private config: PlayConfig;
  private configPath: string;

  constructor(configDir?: string) {
    const baseDir = configDir || process.env.SONDER_CONFIG_DIR || '~/.sonder';
    const expandedDir = baseDir.replace('~', process.env.HOME || '');
    this.configPath = resolve(expandedDir, 'plays.json');

    this.config = this.load();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): PlayConfig {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data) as Partial<PlayConfig>;

        // Merge with defaults
        return {
          ...DEFAULT_CONFIG,
          ...loaded,
          global: { ...DEFAULT_CONFIG.global, ...loaded.global },
        };
      }
    } catch (error) {
      console.warn('[PlayConfig] Failed to load config, using defaults:', error);
    }

    return { ...DEFAULT_CONFIG };
  }

  save(): void {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[PlayConfig] Failed to save config:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Play Enable/Disable
  // ---------------------------------------------------------------------------

  /**
   * Enable a play
   */
  enablePlay(playId: string): boolean {
    if (!playRegistry.has(playId)) {
      console.warn(`[PlayConfig] Unknown play: ${playId}`);
      return false;
    }

    if (!this.config.enabledPlays.includes(playId)) {
      this.config.enabledPlays.push(playId);

      // Initialize settings if not present
      if (!this.config.playSettings[playId]) {
        this.config.playSettings[playId] = { ...DEFAULT_PLAY_SETTINGS };
      }

      this.save();
    }

    return true;
  }

  /**
   * Disable a play
   */
  disablePlay(playId: string): boolean {
    const index = this.config.enabledPlays.indexOf(playId);
    if (index > -1) {
      this.config.enabledPlays.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Toggle a play
   */
  togglePlay(playId: string): boolean {
    if (this.isEnabled(playId)) {
      this.disablePlay(playId);
      return false;
    } else {
      this.enablePlay(playId);
      return true;
    }
  }

  /**
   * Check if a play is enabled
   */
  isEnabled(playId: string): boolean {
    return this.config.enabledPlays.includes(playId);
  }

  /**
   * Get all enabled plays
   */
  getEnabledPlays(): PlayDefinition[] {
    return this.config.enabledPlays
      .map(id => playRegistry.get(id))
      .filter((p): p is PlayDefinition => p !== undefined);
  }

  /**
   * Get all plays with their enabled status
   */
  getAllPlaysWithStatus(): Array<{ play: PlayDefinition; enabled: boolean }> {
    return playRegistry.getAll().map(play => ({
      play,
      enabled: this.isEnabled(play.id),
    }));
  }

  // ---------------------------------------------------------------------------
  // Play Settings
  // ---------------------------------------------------------------------------

  /**
   * Get settings for a play
   */
  getPlaySettings(playId: string): PlaySettings {
    return this.config.playSettings[playId] || { ...DEFAULT_PLAY_SETTINGS };
  }

  /**
   * Update settings for a play
   */
  updatePlaySettings(playId: string, settings: Partial<PlaySettings>): void {
    const current = this.getPlaySettings(playId);
    this.config.playSettings[playId] = {
      ...current,
      ...settings,
      channels: { ...current.channels, ...settings.channels },
    };
    this.save();
  }

  /**
   * Check if a channel is enabled for a play
   */
  isChannelEnabled(playId: string, channel: 'telegram' | 'whatsapp' | 'email'): boolean {
    const settings = this.getPlaySettings(playId);
    return settings.channels[channel];
  }

  // ---------------------------------------------------------------------------
  // Global Settings
  // ---------------------------------------------------------------------------

  /**
   * Get global settings
   */
  getGlobalSettings(): GlobalSettings {
    return this.config.global;
  }

  /**
   * Update global settings
   */
  updateGlobalSettings(settings: Partial<GlobalSettings>): void {
    this.config.global = { ...this.config.global, ...settings };
    this.save();
  }

  /**
   * Check if current time is within quiet hours
   */
  isQuietHours(playId?: string): boolean {
    const settings = playId
      ? this.getPlaySettings(playId)
      : null;

    const quietHours = settings?.quietHours || this.config.global.quietHours;
    const now = new Date();
    const hour = now.getHours();

    const { start, end } = quietHours;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (start > end) {
      return hour >= start || hour < end;
    }

    return hour >= start && hour < end;
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Get raw config (for debugging)
   */
  getRawConfig(): PlayConfig {
    return { ...this.config };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _configManager: PlayConfigManager | null = null;

export function getPlayConfig(): PlayConfigManager {
  if (!_configManager) {
    _configManager = new PlayConfigManager();
  }
  return _configManager;
}

// =============================================================================
// CLI Helper (for setup)
// =============================================================================

export function printPlayStatus(): void {
  const config = getPlayConfig();
  const plays = config.getAllPlaysWithStatus();

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          SONDER - Play Status          ║');
  console.log('╠════════════════════════════════════════╣');

  for (const { play, enabled } of plays) {
    const status = enabled ? '✓ ON ' : '✗ OFF';
    const channels = config.getPlaySettings(play.id).channels;
    const channelStr = [
      channels.telegram ? 'TG' : '',
      channels.whatsapp ? 'WA' : '',
      channels.email ? 'EM' : '',
    ].filter(Boolean).join(',') || 'none';

    console.log(`║ ${status} │ ${play.name.padEnd(20)} │ ${channelStr.padEnd(10)} ║`);
  }

  console.log('╚════════════════════════════════════════╝\n');
}
