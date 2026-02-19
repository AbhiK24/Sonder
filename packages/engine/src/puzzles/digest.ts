/**
 * Digest Generator
 *
 * Collects NPC activities while user is away.
 * Extracts facts and lies for puzzle generation.
 */

import type {
  DailyDigest,
  DigestEvent,
  Puzzle,
} from './types.js';
import { PuzzleEngine } from './engine.js';
import { randomUUID } from 'crypto';

// =============================================================================
// Types for Event Collection
// =============================================================================

export interface NPCConversation {
  id: string;
  timestamp: Date;
  participants: string[];
  messages: Array<{
    speaker: string;
    content: string;
    isPublic: boolean; // Could the player have overheard this?
  }>;
  location?: string;
  topic?: string;
}

export interface NPCActivity {
  id: string;
  timestamp: Date;
  agent: string;
  action: string;
  location?: string;
  witnesses?: string[];
  isSecret?: boolean;
}

export interface NPCKnowledge {
  agent: string;
  facts: string[];           // Things this NPC knows to be true
  secrets: string[];         // Things they're hiding
  suspicions: string[];      // Things they suspect but can't prove
  lies: string[];            // Things they might lie about
}

// =============================================================================
// Digest Generator
// =============================================================================

export class DigestGenerator {
  private conversations: NPCConversation[] = [];
  private activities: NPCActivity[] = [];
  private npcKnowledge: Map<string, NPCKnowledge> = new Map();

  /**
   * Register an NPC's knowledge base
   */
  registerNPC(knowledge: NPCKnowledge): void {
    this.npcKnowledge.set(knowledge.agent, knowledge);
  }

  /**
   * Record a conversation between NPCs
   */
  recordConversation(conversation: NPCConversation): void {
    this.conversations.push(conversation);
  }

  /**
   * Record an NPC activity
   */
  recordActivity(activity: NPCActivity): void {
    this.activities.push(activity);
  }

  /**
   * Generate a daily digest from collected events
   */
  generateDigest(
    since: Date,
    puzzleEngine: PuzzleEngine
  ): DailyDigest {
    // Filter events since last digest
    const recentConversations = this.conversations.filter(
      c => c.timestamp >= since
    );
    const recentActivities = this.activities.filter(
      a => a.timestamp >= since
    );

    // Convert to digest events
    const events: DigestEvent[] = [
      ...this.conversationsToEvents(recentConversations),
      ...this.activitiesToEvents(recentActivities),
    ];

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Generate summary
    const summary = this.generateSummary(events);

    // Create the digest
    const digest: DailyDigest = {
      date: new Date().toISOString().split('T')[0],
      events,
      summary,
      puzzle: null as unknown as Puzzle, // Will be set below
    };

    // Generate puzzle from digest
    digest.puzzle = puzzleEngine.generatePuzzle(digest);

    return digest;
  }

  /**
   * Convert conversations to digest events
   */
  private conversationsToEvents(
    conversations: NPCConversation[]
  ): DigestEvent[] {
    return conversations.map(conv => {
      // Extract facts from conversation
      const facts = this.extractFacts(conv);
      const possibleLies = this.extractPossibleLies(conv);

      return {
        id: conv.id,
        timestamp: conv.timestamp,
        type: 'conversation' as const,
        description: this.describeConversation(conv),
        involvedAgents: conv.participants,
        facts,
        possibleLies,
      };
    });
  }

  /**
   * Convert activities to digest events
   */
  private activitiesToEvents(
    activities: NPCActivity[]
  ): DigestEvent[] {
    return activities.map(act => {
      const knowledge = this.npcKnowledge.get(act.agent);

      return {
        id: act.id,
        timestamp: act.timestamp,
        type: act.isSecret ? 'tension' as const : 'movement' as const,
        description: this.describeActivity(act),
        involvedAgents: [act.agent, ...(act.witnesses || [])],
        facts: knowledge?.facts.slice(0, 2) || [],
        possibleLies: knowledge?.lies.slice(0, 2) || [],
      };
    });
  }

  /**
   * Extract factual statements from a conversation
   */
  private extractFacts(conv: NPCConversation): string[] {
    const facts: string[] = [];

    for (const participant of conv.participants) {
      const knowledge = this.npcKnowledge.get(participant);
      if (knowledge) {
        // Pick facts this NPC would share
        facts.push(...knowledge.facts.slice(0, 1));
      }
    }

    // Also extract facts from conversation content
    // (In real implementation, this would use LLM)
    if (conv.topic) {
      facts.push(`They discussed ${conv.topic}`);
    }

    return facts;
  }

  /**
   * Extract potential lies from a conversation
   */
  private extractPossibleLies(conv: NPCConversation): string[] {
    const lies: string[] = [];

    for (const participant of conv.participants) {
      const knowledge = this.npcKnowledge.get(participant);
      if (knowledge) {
        lies.push(...knowledge.lies.slice(0, 1));
      }
    }

    return lies;
  }

  /**
   * Generate a human-readable description of a conversation
   */
  private describeConversation(conv: NPCConversation): string {
    const participants = conv.participants.join(' and ');
    const location = conv.location ? ` at ${conv.location}` : '';
    const topic = conv.topic ? ` about ${conv.topic}` : '';

    return `${participants} had a conversation${location}${topic}.`;
  }

  /**
   * Generate a human-readable description of an activity
   */
  private describeActivity(act: NPCActivity): string {
    const location = act.location ? ` at ${act.location}` : '';
    return `${act.agent} ${act.action}${location}.`;
  }

  /**
   * Generate a summary of all events
   */
  private generateSummary(events: DigestEvent[]): string {
    if (events.length === 0) {
      return 'All was quiet while you were away.';
    }

    const parts: string[] = [];

    // Count by type
    const conversations = events.filter(e => e.type === 'conversation');
    const tensions = events.filter(e => e.type === 'tension');
    const movements = events.filter(e => e.type === 'movement');

    if (conversations.length > 0) {
      const agents = new Set(conversations.flatMap(c => c.involvedAgents));
      parts.push(
        `${agents.size} people were talking amongst themselves`
      );
    }

    if (tensions.length > 0) {
      parts.push('there were some tense moments');
    }

    if (movements.length > 0) {
      parts.push('various people came and went');
    }

    const summary = parts.length > 0
      ? `While you were away, ${parts.join(', ')}.`
      : 'Things were relatively calm while you were away.';

    return summary;
  }

  /**
   * Clear old events (call after generating digest)
   */
  clearProcessedEvents(before: Date): void {
    this.conversations = this.conversations.filter(
      c => c.timestamp >= before
    );
    this.activities = this.activities.filter(
      a => a.timestamp >= before
    );
  }
}

// =============================================================================
// Story Generator (for demo/testing)
// =============================================================================

export class StoryGenerator {
  private agents: NPCKnowledge[] = [];

  /**
   * Set up NPCs with their knowledge
   */
  setupCast(cast: NPCKnowledge[]): void {
    this.agents = cast;
  }

  /**
   * Generate fake events for testing
   */
  generateFakeEvents(count: number = 5): {
    conversations: NPCConversation[];
    activities: NPCActivity[];
  } {
    const conversations: NPCConversation[] = [];
    const activities: NPCActivity[] = [];

    for (let i = 0; i < count; i++) {
      const now = new Date();
      const hourOffset = Math.floor(Math.random() * 24);
      const timestamp = new Date(now.getTime() - hourOffset * 60 * 60 * 1000);

      if (Math.random() > 0.5 && this.agents.length >= 2) {
        // Generate a conversation
        const [a, b] = this.pickRandom(this.agents, 2);
        conversations.push({
          id: randomUUID(),
          timestamp,
          participants: [a.agent, b.agent],
          messages: [],
          location: this.pickRandom(LOCATIONS, 1)[0],
          topic: this.pickRandom(TOPICS, 1)[0],
        });
      } else if (this.agents.length >= 1) {
        // Generate an activity
        const agent = this.pickRandom(this.agents, 1)[0];
        activities.push({
          id: randomUUID(),
          timestamp,
          agent: agent.agent,
          action: this.pickRandom(ACTIONS, 1)[0],
          location: this.pickRandom(LOCATIONS, 1)[0],
          isSecret: Math.random() > 0.8,
        });
      }
    }

    return { conversations, activities };
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}

// Sample data for story generation
const LOCATIONS = [
  'the tavern',
  'the garden',
  'the library',
  'the courtyard',
  'the kitchen',
  'the cellar',
];

const TOPICS = [
  'the missing jewels',
  'last night\'s strange noises',
  'the new arrival',
  'the upcoming festival',
  'old secrets',
  'money troubles',
];

const ACTIONS = [
  'was seen pacing nervously',
  'slipped away quietly',
  'was overheard arguing',
  'received a mysterious letter',
  'was counting coins',
  'looked troubled',
];

// =============================================================================
// Default Export
// =============================================================================

export const defaultDigestGenerator = new DigestGenerator();
export const storyGenerator = new StoryGenerator();
