/**
 * Plays Module
 *
 * Central management for Sonder plays.
 * A "Play" is a themed application built on the Sonder engine.
 *
 * A Play is the core unit of Sonder — a complete multi-agent experience.
 * Supports: Companion, Game, Simulation, or Hybrid modes.
 */

// Core Play types
export * from './types.js';

// Registry - all available plays
export {
  PlayDefinition,
  PlayAgent,
  WANDERERS_REST,
  CHORUS,
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
