/**
 * Insight Engine
 *
 * Unified system that combines:
 * - Pattern Store: Observed user patterns
 * - Reflection Engine: Pattern detection from data
 * - Trigger Scheduler: Actions based on patterns/conditions
 *
 * The Insight Loop:
 * 1. OBSERVE   - Collect data from conversations, tasks, calendar
 * 2. REFLECT   - Run analyzers to detect patterns
 * 3. STORE     - Persist patterns with evidence
 * 4. TRIGGER   - Create/fire triggers based on patterns
 * 5. ACT       - Execute actions (messages, nudges, celebrations)
 */

import { resolve } from 'path';
import type { LLMProvider } from '../types/index.js';

// Sub-modules
export * from './patterns.js';
export * from './reflection.js';
export * from './triggers.js';

import { PatternStore, Pattern, PatternCategory } from './patterns.js';
import {
  ReflectionEngine,
  UserDataSnapshot,
  ConversationSummary,
  DetectedPattern,
  PatternAnalyzer,
} from './reflection.js';
import {
  TriggerScheduler,
  Trigger,
  TriggerAction,
  FiredTrigger,
} from './triggers.js';

// =============================================================================
// Types
// =============================================================================

export interface InsightEngineConfig {
  // Storage directory
  storageDir: string;

  // How often to run reflection (minutes)
  reflectionIntervalMinutes?: number;

  // How often to check triggers (minutes)
  triggerCheckIntervalMinutes?: number;

  // Auto-create triggers from actionable patterns
  autoCreateTriggers?: boolean;

  // Min pattern confidence to create trigger
  minConfidenceForTrigger?: number;
}

export interface InsightEngineHooks {
  // Called when a pattern is detected
  onPatternDetected?: (pattern: Pattern, isNew: boolean) => void | Promise<void>;

  // Called when a trigger fires
  onTriggerFired?: (fired: FiredTrigger) => void | Promise<void>;

  // Get user data for reflection
  getUserData: (userId: string) => UserDataSnapshot | Promise<UserDataSnapshot>;

  // Check if it's quiet hours for a user
  isQuietHours?: (userId: string) => boolean;

  // Check if user is currently active
  isUserActive?: (userId: string) => boolean;

  // Get task state
  getTaskState?: (userId: string, taskId: string) => { status: string; daysOld: number } | undefined;
}

export interface InsightStats {
  patterns: {
    total: number;
    byCategory: Record<PatternCategory, number>;
    highConfidence: number;
    actionable: number;
  };
  triggers: {
    total: number;
    enabled: number;
    firedToday: number;
  };
  lastReflection?: Date;
}

// =============================================================================
// Insight Engine
// =============================================================================

export class InsightEngine {
  // Sub-systems
  public readonly patterns: PatternStore;
  public readonly reflection: ReflectionEngine;
  public readonly triggers: TriggerScheduler;

  private provider: LLMProvider;
  private config: InsightEngineConfig;
  private hooks: InsightEngineHooks;

  private reflectionInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private lastReflection: Map<string, Date> = new Map();

  constructor(
    provider: LLMProvider,
    config: InsightEngineConfig,
    hooks: InsightEngineHooks
  ) {
    this.provider = provider;
    this.config = {
      reflectionIntervalMinutes: 60,
      triggerCheckIntervalMinutes: 5,
      autoCreateTriggers: true,
      minConfidenceForTrigger: 0.6,
      ...config,
    };
    this.hooks = hooks;

    // Initialize sub-systems
    this.patterns = new PatternStore(
      resolve(config.storageDir, 'patterns.json')
    );

    this.reflection = new ReflectionEngine(provider);

    this.triggers = new TriggerScheduler(
      resolve(config.storageDir, 'triggers.json')
    );

    // Wire up trigger context providers
    this.triggers.setContextProviders({
      getPatterns: (userId) => this.patterns.getForUser(userId),
      isQuietHours: hooks.isQuietHours,
      isUserActive: hooks.isUserActive,
      getTaskState: hooks.getTaskState,
    });

    // Wire up trigger fire callback
    this.triggers.onFire(async (fired) => {
      if (this.hooks.onTriggerFired) {
        await this.hooks.onTriggerFired(fired);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the insight engine
   */
  start(): void {
    if (this.running) return;

    this.running = true;

    // Start trigger checking
    this.triggers.start(this.config.triggerCheckIntervalMinutes);

    // Start reflection loop
    const reflectionMinutes = this.config.reflectionIntervalMinutes || 60;
    this.reflectionInterval = setInterval(
      () => this.reflectionTick(),
      reflectionMinutes * 60 * 1000
    );

    console.log(`[InsightEngine] Started (reflection every ${reflectionMinutes}m, triggers every ${this.config.triggerCheckIntervalMinutes}m)`);
  }

  /**
   * Stop the insight engine
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.triggers.stop();

    if (this.reflectionInterval) {
      clearInterval(this.reflectionInterval);
      this.reflectionInterval = null;
    }

    console.log('[InsightEngine] Stopped');
  }

  // ---------------------------------------------------------------------------
  // Customization
  // ---------------------------------------------------------------------------

  /**
   * Add a custom pattern analyzer
   */
  addAnalyzer(analyzer: PatternAnalyzer): void {
    this.reflection.addAnalyzer(analyzer);
  }

  // ---------------------------------------------------------------------------
  // Reflection Loop
  // ---------------------------------------------------------------------------

  /**
   * Run reflection for all known users
   */
  private async reflectionTick(): Promise<void> {
    // Get all users with patterns (they've been reflected on before)
    const userIds = this.getAllKnownUsers();

    for (const userId of userIds) {
      try {
        await this.reflectForUser(userId);
      } catch (error) {
        console.error(`[InsightEngine] Reflection failed for ${userId}:`, error);
      }
    }
  }

  /**
   * Run reflection for a specific user
   */
  async reflectForUser(userId: string): Promise<DetectedPattern[]> {
    const userData = await this.hooks.getUserData(userId);
    const detected = await this.reflection.analyze(userData);

    const newPatterns: Pattern[] = [];

    for (const pattern of detected) {
      const stored = this.patterns.upsert({
        userId,
        category: pattern.category,
        valence: pattern.valence,
        description: pattern.description,
        shortForm: pattern.shortForm,
        confidence: pattern.confidence,
        occurrences: 1,
        firstObserved: new Date(),
        lastObserved: new Date(),
        evidence: pattern.evidence,
        subjects: pattern.subjects,
        actionable: pattern.actionable,
        suggestedAction: pattern.suggestedAction,
      });

      const isNew = stored.occurrences === 1;
      newPatterns.push(stored);

      // Fire hook
      if (this.hooks.onPatternDetected) {
        await this.hooks.onPatternDetected(stored, isNew);
      }

      // Auto-create trigger if enabled
      if (this.config.autoCreateTriggers &&
          stored.actionable &&
          stored.confidence >= (this.config.minConfidenceForTrigger || 0.6)) {
        this.triggers.createFromPattern(stored, userId);
      }
    }

    this.lastReflection.set(userId, new Date());

    console.log(`[InsightEngine] Reflected for ${userId}: ${detected.length} patterns detected`);

    return detected;
  }

  /**
   * Run conversation-based reflection
   */
  async reflectOnConversations(
    userId: string,
    conversations: ConversationSummary[]
  ): Promise<DetectedPattern[]> {
    const detected = await this.reflection.analyzeConversations(userId, conversations);

    for (const pattern of detected) {
      const stored = this.patterns.upsert({
        userId,
        category: pattern.category,
        valence: pattern.valence,
        description: pattern.description,
        shortForm: pattern.shortForm,
        confidence: pattern.confidence,
        occurrences: 1,
        firstObserved: new Date(),
        lastObserved: new Date(),
        evidence: pattern.evidence,
        subjects: pattern.subjects,
        actionable: pattern.actionable,
        suggestedAction: pattern.suggestedAction,
      });

      if (this.hooks.onPatternDetected) {
        await this.hooks.onPatternDetected(stored, stored.occurrences === 1);
      }

      // Auto-create trigger
      if (this.config.autoCreateTriggers &&
          stored.actionable &&
          stored.confidence >= (this.config.minConfidenceForTrigger || 0.6)) {
        this.triggers.createFromPattern(stored, userId);
      }
    }

    return detected;
  }

  // ---------------------------------------------------------------------------
  // Manual Triggers
  // ---------------------------------------------------------------------------

  /**
   * Manually trigger reflection for a user
   */
  async triggerReflection(userId: string): Promise<DetectedPattern[]> {
    return this.reflectForUser(userId);
  }

  /**
   * Manually check triggers for a user
   */
  async checkTriggers(userId?: string): Promise<FiredTrigger[]> {
    const fired = await this.triggers.checkAllTriggers();
    return userId
      ? fired.filter(f => f.userId === userId)
      : fired;
  }

  /**
   * Create a manual trigger
   */
  createTrigger(params: Parameters<typeof TriggerScheduler.prototype.create>[0]): Trigger {
    return this.triggers.create(params);
  }

  // ---------------------------------------------------------------------------
  // Pattern Operations
  // ---------------------------------------------------------------------------

  /**
   * Get patterns for a user
   */
  getPatternsForUser(userId: string): Pattern[] {
    return this.patterns.getForUser(userId);
  }

  /**
   * Get actionable patterns
   */
  getActionablePatterns(userId: string): Pattern[] {
    return this.patterns.getActionable(userId);
  }

  /**
   * Get concerning patterns (high confidence, negative)
   */
  getConcerningPatterns(userId: string): Pattern[] {
    return this.patterns.getConcerning(userId);
  }

  /**
   * Get positive patterns (for celebrations)
   */
  getPositivePatterns(userId: string): Pattern[] {
    return this.patterns.getPositive(userId);
  }

  /**
   * Add evidence to a pattern
   */
  addPatternEvidence(
    patternId: string,
    observation: string,
    source: 'conversation' | 'task' | 'calendar' | 'behavior' | 'inferred'
  ): void {
    this.patterns.addEvidence(patternId, {
      date: new Date(),
      observation,
      source,
    });
  }

  /**
   * Archive a pattern (when it's no longer relevant)
   */
  archivePattern(patternId: string): void {
    this.patterns.archive(patternId);
  }

  // ---------------------------------------------------------------------------
  // Trigger Operations
  // ---------------------------------------------------------------------------

  /**
   * Get triggers for a user
   */
  getTriggersForUser(userId: string): Trigger[] {
    return this.triggers.getForUser(userId);
  }

  /**
   * Enable/disable a trigger
   */
  setTriggerEnabled(triggerId: string, enabled: boolean): void {
    this.triggers.setEnabled(triggerId, enabled);
  }

  /**
   * Delete a trigger
   */
  deleteTrigger(triggerId: string): void {
    this.triggers.delete(triggerId);
  }

  // ---------------------------------------------------------------------------
  // Stats & Debug
  // ---------------------------------------------------------------------------

  /**
   * Get stats for a user
   */
  getStats(userId: string): InsightStats {
    const patternStats = this.patterns.getStats(userId);
    const userTriggers = this.triggers.getForUser(userId);

    return {
      patterns: {
        total: patternStats.total,
        byCategory: patternStats.byCategory,
        highConfidence: this.patterns.getHighConfidence(userId).length,
        actionable: this.patterns.getActionable(userId).length,
      },
      triggers: {
        total: userTriggers.length,
        enabled: userTriggers.filter(t => t.enabled).length,
        firedToday: userTriggers.reduce((sum, t) => sum + t.todayFirings, 0),
      },
      lastReflection: this.lastReflection.get(userId),
    };
  }

  /**
   * Get all known user IDs
   */
  private getAllKnownUsers(): string[] {
    // Get users from patterns
    const patternUsers = new Set<string>();
    for (const pattern of this.patterns.getForUser('*')) {
      // PatternStore doesn't have getAll, so we work around
    }

    // For now, return users from last reflection
    return Array.from(this.lastReflection.keys());
  }

  /**
   * Register a user for reflection (call this to include them in periodic reflection)
   */
  registerUser(userId: string): void {
    if (!this.lastReflection.has(userId)) {
      this.lastReflection.set(userId, new Date(0)); // Mark as needing reflection
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an insight engine with default config
 */
export function createInsightEngine(
  provider: LLMProvider,
  storageDir: string,
  hooks: InsightEngineHooks
): InsightEngine {
  return new InsightEngine(
    provider,
    { storageDir },
    hooks
  );
}
