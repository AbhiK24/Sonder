/**
 * Sonder Engine - Core Types
 *
 * These types are derived from the technical specifications.
 * See /docs/specs/ for full documentation.
 */

// =============================================================================
// NPC Types
// =============================================================================

export interface NPC {
  id: string;
  name: string;
  archetype: NPCArchetype;
  status: NPCStatus;
  location: string;
  mood: Mood;
  trust: number; // 0-100

  // Loaded from IDENTITY.md
  identity: NPCIdentity;

  // Loaded from MEMORY.md
  memory: NPCMemory;

  // Loaded from STATEMENTS.md
  statements: Statement[];

  // Relationships with other NPCs
  relationships: Relationship[];

  // Secrets with trust thresholds
  secrets: Secret[];
}

export type NPCArchetype =
  | 'core_cast'      // Permanent residents (Maren)
  | 'villager'       // Village NPCs (Miller, Blacksmith)
  | 'traveler'       // Rotating visitors (Kira, Marcus)
  | 'ephemeral';     // One-time visitors

export type NPCStatus =
  | 'present'        // In the tavern
  | 'away'           // In the village
  | 'departed'       // Left permanently
  | 'dead';          // Gone forever

export interface NPCIdentity {
  name: string;
  role: string;
  personality: string[];
  voicePatterns: string[];
  examplePhrases: string[];
  backstory: string;
  currentGoals: string[];
  quirks: string[];
}

export interface NPCMemory {
  aboutPlayer: Assertion[];
  aboutOthers: Record<string, Assertion[]>;
  worldFacts: Assertion[];
}

export interface Assertion {
  content: string;
  day: number;
  confidence: 'high' | 'medium' | 'low';
  type: AssertionType;
  sensitivity?: number; // 1-10
}

export type AssertionType =
  | 'fact_about_player'
  | 'fact_about_other'
  | 'fact_about_world'
  | 'relationship_change'
  | 'promise_made'
  | 'secret_shared';

export interface Statement {
  content: string;
  day: number;
  context: string;
  verifiable: boolean;
}

export interface Secret {
  content: string;
  trustThreshold: number;
  neverReveal?: boolean;
}

export interface Relationship {
  targetId: string;
  sentiment: number;     // -100 to 100
  trust: number;         // 0-100
  tags: string[];        // e.g., ['family', 'rival', 'friend']
  history: string[];     // Key events
}

export interface Mood {
  primary: MoodType;
  intensity: number;     // 1-10
  secondary?: MoodType;
}

export type MoodType =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful'
  | 'anxious' | 'suspicious' | 'trusting' | 'grieving'
  | 'hopeful' | 'resigned' | 'defensive' | 'curious';

// =============================================================================
// Case Types
// =============================================================================

export interface Case {
  id: string;
  title: string;
  type: CaseType;
  state: CaseState;
  complexity: CaseComplexity;

  createdAt: Date;
  presentedAt?: Date;
  resolvedAt?: Date;

  truth: CaseTruth;
  surface: CaseSurface;
  client: CaseClient;
  npcsInvolved: CaseNPCInvolvement[];
  redHerrings: RedHerring[];
  resolution: CaseResolution;
  consequences: CaseConsequences;
  worseningEvents: WorseningEvent[];

  // Player's investigation
  playerNotes: PlayerNote[];
  playerAccusations: PlayerAccusation[];
}

export type CaseType =
  | 'missing' | 'theft' | 'accusation' | 'feud'
  | 'protection' | 'secret' | 'mystery';

export type CaseState =
  | 'latent'     // Exists but player unaware
  | 'presented'  // Brought to player
  | 'active'     // Under investigation
  | 'resolved'   // Completed (success or failure)
  | 'abandoned'  // Player ignored
  | 'escalated'; // Resolved without player

export type CaseComplexity = 'simple' | 'medium' | 'complex' | 'intricate';

export interface CaseTruth {
  summary: string;
  whatHappened: string[];
  perpetrator?: string;
  motive: string;
}

export interface CaseSurface {
  presentedAs: string;
  clientBelief: string;
  emotionalHook: string;
}

export interface CaseClient {
  npcId: string;
  whyTheyAsk: string;
  knowledge: string[];
  hidden: string[];
  emotionalState: string;
}

export interface CaseNPCInvolvement {
  npcId: string;
  role: string;
  knowledge: string[];
  willShareAtTrust: number;
  mightLie: boolean;
  lieReason?: string;
}

export interface RedHerring {
  falseLead: string;
  whySuspicious: string;
  howDisproved: string;
  dangerIfAccused: string;
}

export interface CaseResolution {
  truthPlayerMustState: string;
  confrontationTarget: string;
  keyEvidenceNeeded: string[];
  minimumNPCsToQuestion: number;
}

export interface CaseConsequences {
  solvedCorrectly: ConsequenceSet;
  solvedWrong: Record<string, ConsequenceSet>;
  tooSlow: Record<string, string>;
}

export interface ConsequenceSet {
  immediate: string;
  delayed?: string;
  reputationChange: number;
  relationshipChanges?: Record<string, number>;
}

export interface WorseningEvent {
  day: number;
  event: string;
  occurred: boolean;
}

export interface PlayerNote {
  timestamp: Date;
  note: string;
}

export interface PlayerAccusation {
  timestamp: Date;
  target: string;
  accusation: string;
  result: 'correct' | 'partial' | 'incorrect';
}

// =============================================================================
// Router Types
// =============================================================================

export type Intent =
  | 'TALK'      // Speaking to current NPC
  | 'SWITCH'    // Change to different NPC
  | 'LOOK'      // Observe room
  | 'OBSERVE'   // Watch specific NPC
  | 'ACCUSE'    // Make accusation
  | 'REVEAL'    // Reveal information
  | 'PRESENT'   // Present contradiction
  | 'LEAVE'     // End conversation
  | 'JOURNAL'   // Request case notes
  | 'STATUS'    // Request stats
  | 'WAIT'      // Let time pass
  | 'UNCLEAR';  // Ambiguous input

export interface RouterResult {
  intent: Intent;
  target?: string;
  parameters: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  possibilities?: string[]; // For UNCLEAR intent
}

// =============================================================================
// World Tick Types
// =============================================================================

export interface WorldTickResult {
  npcUpdates: NPCUpdate[];
  interactions: NPCInteraction[];
  informationSpread: InformationSpread[];
  patternsDetected: DramaticPattern[];
  tensionChanges: TensionChange[];
  eventsToFire: WorldEvent[];
  arrivalsDepartures: ArrivalDeparture[];
  notifications: Notification[];
}

export interface NPCUpdate {
  npcId: string;
  moodChange?: string;
  reason: string;
  location?: string;
}

export interface NPCInteraction {
  between: [string, string];
  type: string;
  result: string;
  witnessedBy: string[];
}

export interface InformationSpread {
  info: string;
  from: string;
  to: string;
  spreadToNext?: string[];
  dangerLevel: number;
}

export interface DramaticPattern {
  type: PatternType | 'NOVEL';
  name: string;
  involved: string[];
  tension: number;
  evidence: string[];
  escalationTriggers: string[];
  predictedTimeline: string;
  playerOpportunities: string[];
}

export type PatternType =
  | 'HUNTER_AND_PREY'
  | 'LOVE_TRIANGLE'
  | 'SECRET_AT_RISK'
  | 'FEUD_ESCALATION'
  | 'HIDDEN_CONNECTION'
  | 'BETRAYAL_IMMINENT'
  | 'MYSTERY_CONVERGING'
  | 'DEPARTURE_PRESSURE';

export interface TensionChange {
  between: [string, string];
  oldValue: number;
  newValue: number;
  reason: string;
}

export interface WorldEvent {
  id: string;
  type: string;
  description: string;
  involvedNPCs: string[];
  consequences: string[];
}

export interface ArrivalDeparture {
  type: 'arrival' | 'departure';
  npcId: string;
  reason: string;
  plotRelevance: string;
}

export interface Notification {
  urgency: 'info' | 'attention' | 'urgent' | 'critical';
  message: string;
  from: string;
  triggerCondition?: string;
}

// =============================================================================
// Conversation Types
// =============================================================================

export interface Message {
  id: string;
  timestamp: Date;
  speaker: 'player' | 'npc' | 'tavern' | 'gut';
  npcId?: string;
  content: string;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  intent?: Intent;
  trustChange?: number;
  informationRevealed?: string[];
  statementLogged?: boolean;
}

export interface ConversationContext {
  currentNPC?: NPC;
  presentNPCs: NPC[];
  location: string;
  timeOfDay: TimeOfDay;
  recentMessages: Message[];
  activeCase?: Case;
  playerState: PlayerState;
}

export type TimeOfDay =
  | 'morning'    // 6am-9am
  | 'midday'     // 9am-12pm
  | 'afternoon'  // 12pm-6pm
  | 'evening'    // 6pm-10pm
  | 'late_night' // 10pm-12am
  | 'night';     // 12am-6am

// =============================================================================
// Player Types
// =============================================================================

export interface PlayerState {
  reputation: number;        // 0-100
  casesSolved: number;
  successRate: number;
  typesCompleted: CaseType[];
  investigationStyle: string[];
  typicalOnlineHours: number[];
  lastSeen: Date;
}

export interface PlayerProfile {
  reputation: number;
  traits: string[];
  relationships: Record<string, number>; // NPC ID -> trust
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  caseCount: number;
}

// =============================================================================
// World State Types
// =============================================================================

export interface WorldState {
  currentDay: number;
  currentTime: TimeOfDay;
  weather: string;

  npcs: Map<string, NPC>;
  cases: Map<string, Case>;
  tensions: Map<string, number>; // "npcA:npcB" -> tension level

  worldFacts: string[];
  recentEvents: WorldEvent[];

  player: PlayerState;
  tavernTier: number;
}

// =============================================================================
// LLM Provider Types
// =============================================================================

export interface LLMProvider {
  name: string;
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface ModelConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'minimax' | 'lmstudio';
  endpoint?: string;
  modelName: string;
  apiKey?: string;
}

// =============================================================================
// Soul Types
// =============================================================================

export interface Soul {
  id: string;
  name: string;
  version: string;

  worldBible: WorldBible;
  aesthetic: Aesthetic;
  rules: GameRules;
  npcArchetypes: NPCArchetype[];
  eventPatterns: EventPattern[];
  seedState: SeedState;
}

export interface WorldBible {
  name: string;
  description: string;
  history: string;
  geography: string;
  factions: Faction[];
  cosmology: string;
}

export interface Aesthetic {
  tone: string[];
  mood: string[];
  visualStyle: string;
  narrativeVoice: string;
}

export interface GameRules {
  possible: string[];
  impossible: string[];
  constraints: string[];
}

export interface Faction {
  name: string;
  description: string;
  values: string[];
  relationships: Record<string, string>;
}

export interface EventPattern {
  name: string;
  triggers: string[];
  template: string;
  outcomes: string[];
}

export interface SeedState {
  startingNPCs: string[];
  initialSituation: string;
  firstCase?: string;
}
