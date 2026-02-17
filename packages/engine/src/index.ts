/**
 * Sonder Engine
 *
 * An engine for chat-based games where NPCs feel alive.
 * Local-first, LLM-powered, conversation-driven.
 */

// Types
export * from './types/index.js';

// Core
export { GameController } from './core/game-controller.js';
export { WorldEngine } from './core/world-engine.js';
export { ConversationManager } from './core/conversation.js';
export { Router } from './core/router.js';

// LLM Providers
export { createProvider } from './llm/providers.js';
export type { LLMProvider, ModelConfig, GenerateOptions } from './types/index.js';

// Memory
export { MemoryManager } from './memory/manager.js';
export { loadIdentity, loadMemory, loadStatements } from './memory/files.js';

// NPCs
export { NPCManager } from './npcs/manager.js';

// Chat
export { TelegramBot } from './chat/telegram.js';

// Version
export const VERSION = '0.1.0';
