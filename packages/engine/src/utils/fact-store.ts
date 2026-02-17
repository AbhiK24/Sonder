/**
 * Fact Store
 *
 * Stores facts/assertions extracted from conversations.
 * Tracks sources, verification status, and detects contradictions.
 */

export type FactSource = {
  type: 'npc' | 'player' | 'observation' | 'world';
  name: string;  // NPC name, "player", or "tavern"
  day: number;
  context?: string;  // Brief context of when this was said
};

export type VerificationStatus =
  | 'unverified'    // Just claimed, no corroboration
  | 'verified'      // Confirmed by another source
  | 'contradicted'  // Another source says different
  | 'lie'           // Proven false
  | 'truth';        // Proven true

export interface Fact {
  id: string;
  subject: string;      // Who/what is this about: "kira", "player", "previous_owner", "tavern"
  claim: string;        // The actual fact: "travels northern routes", "came from the capital"
  source: FactSource;
  status: VerificationStatus;
  confidence: number;   // 0-1, increases with corroboration
  contradictions: string[];  // IDs of facts that contradict this
  corroborations: string[];  // IDs of facts that support this
  createdAt: string;    // ISO string
}

export interface Contradiction {
  factA: Fact;
  factB: Fact;
  description: string;
}

export class FactStore {
  private facts: Map<string, Fact> = new Map();
  private bySubject: Map<string, Set<string>> = new Map();
  private bySource: Map<string, Set<string>> = new Map();

  private generateId(): string {
    return `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Add a new fact to the store
   */
  addFact(
    subject: string,
    claim: string,
    source: FactSource
  ): { fact: Fact; contradictions: Contradiction[] } {
    const id = this.generateId();
    const fact: Fact = {
      id,
      subject: subject.toLowerCase(),
      claim,
      source,
      status: 'unverified',
      confidence: 0.5,
      contradictions: [],
      corroborations: [],
      createdAt: new Date().toISOString(),
    };

    // Check for contradictions with existing facts
    const contradictions = this.findContradictions(fact);

    // Check for corroborations
    const corroborations = this.findCorroborations(fact);

    // Update status based on findings
    if (contradictions.length > 0) {
      fact.status = 'contradicted';
      fact.confidence = Math.max(0.2, fact.confidence - 0.2 * contradictions.length);
      fact.contradictions = contradictions.map(c =>
        c.factA.id === id ? c.factB.id : c.factA.id
      );

      // Update contradicting facts too
      for (const c of contradictions) {
        const other = c.factA.id === id ? c.factB : c.factA;
        other.status = 'contradicted';
        other.contradictions.push(id);
      }
    }

    if (corroborations.length > 0) {
      fact.status = 'verified';
      fact.confidence = Math.min(1, fact.confidence + 0.2 * corroborations.length);
      fact.corroborations = corroborations.map(f => f.id);

      // Update corroborating facts
      for (const corr of corroborations) {
        corr.status = 'verified';
        corr.corroborations.push(id);
        corr.confidence = Math.min(1, corr.confidence + 0.1);
      }
    }

    // Store the fact
    this.facts.set(id, fact);

    // Index by subject
    if (!this.bySubject.has(fact.subject)) {
      this.bySubject.set(fact.subject, new Set());
    }
    this.bySubject.get(fact.subject)!.add(id);

    // Index by source
    const sourceKey = `${source.type}:${source.name}`;
    if (!this.bySource.has(sourceKey)) {
      this.bySource.set(sourceKey, new Set());
    }
    this.bySource.get(sourceKey)!.add(id);

    return { fact, contradictions };
  }

  /**
   * Find facts that contradict a given fact
   */
  private findContradictions(newFact: Fact): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const subjectFacts = this.getFactsAbout(newFact.subject);

    for (const existing of subjectFacts) {
      // Skip if same source (NPCs don't contradict themselves... usually)
      if (existing.source.type === newFact.source.type &&
          existing.source.name === newFact.source.name) {
        continue;
      }

      // Simple contradiction detection: opposite claims about same subject
      // In production, this would use LLM for semantic comparison
      if (this.claimsContradict(existing.claim, newFact.claim)) {
        contradictions.push({
          factA: existing,
          factB: newFact,
          description: `"${existing.claim}" vs "${newFact.claim}"`,
        });
      }
    }

    return contradictions;
  }

  /**
   * Find facts that corroborate a given fact
   */
  private findCorroborations(newFact: Fact): Fact[] {
    const corroborations: Fact[] = [];
    const subjectFacts = this.getFactsAbout(newFact.subject);

    for (const existing of subjectFacts) {
      // Must be different source to count as corroboration
      if (existing.source.type === newFact.source.type &&
          existing.source.name === newFact.source.name) {
        continue;
      }

      if (this.claimsCorroborate(existing.claim, newFact.claim)) {
        corroborations.push(existing);
      }
    }

    return corroborations;
  }

  /**
   * Simple heuristic for contradiction detection
   * Returns true if claims seem to contradict
   */
  private claimsContradict(claimA: string, claimB: string): boolean {
    const a = claimA.toLowerCase();
    const b = claimB.toLowerCase();

    // Check for negation patterns
    const negations = [
      [/never/, /always/],
      [/didn't/, /did/],
      [/wasn't/, /was/],
      [/not /, / /],
      [/no /, /has /],
      [/innocent/, /guilty/],
      [/alive/, /dead/],
      [/truth/, /lie/],
      [/friend/, /enemy/],
      [/trust/, /betray/],
    ];

    for (const [neg1, neg2] of negations) {
      if ((neg1.test(a) && neg2.test(b)) || (neg2.test(a) && neg1.test(b))) {
        // Check if they're about similar topics (share significant words)
        const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 3));
        const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 3));
        const overlap = [...wordsA].filter(w => wordsB.has(w));
        if (overlap.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Simple heuristic for corroboration detection
   */
  private claimsCorroborate(claimA: string, claimB: string): boolean {
    const a = claimA.toLowerCase();
    const b = claimB.toLowerCase();

    // High word overlap suggests similar claims
    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 3));
    const overlap = [...wordsA].filter(w => wordsB.has(w));

    // If more than 50% words overlap, likely corroboration
    const overlapRatio = overlap.length / Math.min(wordsA.size, wordsB.size);
    return overlapRatio > 0.5;
  }

  /**
   * Get all facts about a subject
   */
  getFactsAbout(subject: string): Fact[] {
    const ids = this.bySubject.get(subject.toLowerCase());
    if (!ids) return [];
    return [...ids].map(id => this.facts.get(id)!);
  }

  /**
   * Get all facts from a source
   */
  getFactsFrom(type: FactSource['type'], name: string): Fact[] {
    const key = `${type}:${name}`;
    const ids = this.bySource.get(key);
    if (!ids) return [];
    return [...ids].map(id => this.facts.get(id)!);
  }

  /**
   * Get all contradicted facts (potential lies)
   */
  getContradictions(): Fact[] {
    return [...this.facts.values()].filter(f => f.status === 'contradicted');
  }

  /**
   * Mark a fact as verified truth or lie
   */
  resolve(factId: string, status: 'truth' | 'lie'): void {
    const fact = this.facts.get(factId);
    if (!fact) return;

    fact.status = status;
    fact.confidence = status === 'truth' ? 1 : 0;

    // Update contradicting facts
    if (status === 'truth') {
      for (const contrId of fact.contradictions) {
        const contr = this.facts.get(contrId);
        if (contr) {
          contr.status = 'lie';
          contr.confidence = 0;
        }
      }
    }
  }

  /**
   * Get facts the player should be suspicious about
   */
  getSuspiciousFacts(): Fact[] {
    return [...this.facts.values()].filter(f =>
      f.status === 'contradicted' ||
      (f.status === 'unverified' && f.confidence < 0.4)
    );
  }

  /**
   * Format facts for display
   */
  formatFactsAbout(subject: string): string {
    const facts = this.getFactsAbout(subject);
    if (facts.length === 0) return `No known facts about ${subject}.`;

    const lines = [`*Facts about ${subject}*\n`];

    for (const fact of facts) {
      const statusIcon = {
        'unverified': '❓',
        'verified': '✓',
        'contradicted': '⚠️',
        'lie': '✗',
        'truth': '✓✓',
      }[fact.status];

      const source = fact.source.type === 'npc'
        ? fact.source.name
        : fact.source.type;

      lines.push(`${statusIcon} "${fact.claim}" (${source}, day ${fact.source.day})`);
    }

    return lines.join('\n');
  }

  /**
   * Serialize for persistence
   */
  serialize(): object {
    return {
      facts: [...this.facts.entries()],
    };
  }

  /**
   * Deserialize from persistence
   */
  static deserialize(data: any): FactStore {
    const store = new FactStore();
    if (data?.facts) {
      for (const [id, fact] of data.facts) {
        store.facts.set(id, fact);

        // Rebuild indexes
        if (!store.bySubject.has(fact.subject)) {
          store.bySubject.set(fact.subject, new Set());
        }
        store.bySubject.get(fact.subject)!.add(id);

        const sourceKey = `${fact.source.type}:${fact.source.name}`;
        if (!store.bySource.has(sourceKey)) {
          store.bySource.set(sourceKey, new Set());
        }
        store.bySource.get(sourceKey)!.add(id);
      }
    }
    return store;
  }

  /**
   * Get all facts
   */
  getAllFacts(): Fact[] {
    return [...this.facts.values()];
  }

  /**
   * Clear all facts
   */
  clear(): void {
    this.facts.clear();
    this.bySubject.clear();
    this.bySource.clear();
  }
}
