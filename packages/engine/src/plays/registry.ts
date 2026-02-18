/**
 * Play Registry
 *
 * Central registry of all available plays.
 * Each play registers itself with metadata and entry point.
 */

// =============================================================================
// Types
// =============================================================================

export interface PlayDefinition {
  id: string;
  name: string;
  description: string;
  version: string;

  // Channels this play supports
  channels: PlayChannels;

  // Agents in this play
  agents: PlayAgent[];

  // Path to play's root directory
  rootPath: string;
}

export interface PlayChannels {
  telegram?: {
    botTokenEnvVar: string;  // e.g., "SWARGALOKA_TELEGRAM_BOT_TOKEN"
    botUsername?: string;    // e.g., "@SwargalokaBot"
  };
  whatsapp?: {
    // Uses shared Sonder WhatsApp, but play-specific formatting
    enabled: boolean;
    messagePrefix?: string;  // e.g., "✨"
  };
  email?: {
    enabled: boolean;
    fromNamePrefix?: string;  // e.g., "Angels"
  };
}

export interface PlayAgent {
  id: string;
  name: string;
  emoji?: string;
  role: string;
}

// =============================================================================
// Built-in Play Definitions
// =============================================================================

export const WANDERERS_REST: PlayDefinition = {
  id: 'wanderers-rest',
  name: "Wanderer's Rest",
  description: 'A mystery game where you solve crimes through conversation',
  version: '0.1.0',
  channels: {
    telegram: {
      botTokenEnvVar: 'WANDERERS_REST_TELEGRAM_BOT_TOKEN',
      botUsername: '@WanderersRestBot',
    },
    whatsapp: {
      enabled: true,
      messagePrefix: '🏠',
    },
    email: {
      enabled: true,
      fromNamePrefix: 'Tavern',
    },
  },
  agents: [
    { id: 'maren', name: 'Maren', emoji: '🍺', role: 'Barkeep' },
    { id: 'kira', name: 'Kira', emoji: '🎒', role: 'Merchant' },
    { id: 'aldric', name: 'Aldric', emoji: '🔨', role: 'Blacksmith' },
    { id: 'elena', name: 'Elena', emoji: '🌿', role: 'Herbalist' },
    { id: 'thom', name: 'Thom', emoji: '⚔️', role: 'Guard Captain' },
  ],
  rootPath: 'packages/plays/wanderers-rest',
};

export const SWARGALOKA: PlayDefinition = {
  id: 'swargaloka',
  name: 'Swargaloka',
  description: 'Celestial productivity companions for ADHD minds',
  version: '0.1.0',
  channels: {
    telegram: {
      botTokenEnvVar: 'SWARGALOKA_TELEGRAM_BOT_TOKEN',
      botUsername: '@SwargalokaBot',
    },
    whatsapp: {
      enabled: true,
      messagePrefix: '✨',
    },
    email: {
      enabled: true,
      fromNamePrefix: 'Angels',
    },
  },
  agents: [
    { id: 'chitralekha', name: 'Chitralekha', emoji: '📜', role: 'The Rememberer' },
    { id: 'urvashi', name: 'Urvashi', emoji: '⚡', role: 'The Spark' },
    { id: 'menaka', name: 'Menaka', emoji: '🎯', role: 'The Strategist' },
    { id: 'rambha', name: 'Rambha', emoji: '🎉', role: 'The Celebrator' },
    { id: 'tilottama', name: 'Tilottama', emoji: '🪞', role: 'The Mirror' },
  ],
  rootPath: 'packages/plays/swargaloka',
};

// =============================================================================
// Registry
// =============================================================================

class PlayRegistry {
  private plays: Map<string, PlayDefinition> = new Map();

  constructor() {
    // Register built-in plays
    this.register(WANDERERS_REST);
    this.register(SWARGALOKA);
  }

  /**
   * Register a play definition
   */
  register(play: PlayDefinition): void {
    this.plays.set(play.id, play);
  }

  /**
   * Get a play by ID
   */
  get(playId: string): PlayDefinition | undefined {
    return this.plays.get(playId);
  }

  /**
   * Get all registered plays
   */
  getAll(): PlayDefinition[] {
    return Array.from(this.plays.values());
  }

  /**
   * Get play IDs
   */
  getIds(): string[] {
    return Array.from(this.plays.keys());
  }

  /**
   * Check if a play exists
   */
  has(playId: string): boolean {
    return this.plays.has(playId);
  }
}

// Singleton
export const playRegistry = new PlayRegistry();
