/**
 * Plays Module
 *
 * Central management for Sonder plays.
 * A "Play" is a themed application built on the Sonder engine.
 */

// Registry - all available plays
export {
  PlayDefinition,
  PlayChannels,
  PlayAgent,
  WANDERERS_REST,
  SWARGALOKA,
  playRegistry,
} from './registry.js';

// Config - user's enabled/disabled plays
export {
  PlayConfig,
  PlaySettings,
  GlobalSettings,
  PlayConfigManager,
  getPlayConfig,
  printPlayStatus,
} from './config.js';

// Loader - loads and initializes plays
export {
  LoadedPlay,
  PlayLoaderOptions,
  PlayLoader,
  getPlayLoader,
} from './loader.js';
