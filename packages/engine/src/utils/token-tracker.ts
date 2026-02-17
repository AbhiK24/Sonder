/**
 * Token Tracker
 *
 * Tracks LLM token consumption by category and date.
 * For player dashboards and cost monitoring.
 */

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface DailyUsage {
  date: string;  // YYYY-MM-DD
  chat: number;
  worldTick: number;
  voices: number;
  router: number;
  total: number;
}

export interface TokenStats {
  chat: TokenUsage;
  worldTick: TokenUsage;
  voices: TokenUsage;
  router: TokenUsage;
  total: TokenUsage;
  daily: DailyUsage[];
  lastReset: Date;
}

class TokenTracker {
  private stats: Map<number, TokenStats> = new Map();

  private createEmpty(): TokenStats {
    return {
      chat: { input: 0, output: 0, total: 0 },
      worldTick: { input: 0, output: 0, total: 0 },
      voices: { input: 0, output: 0, total: 0 },
      router: { input: 0, output: 0, total: 0 },
      total: { input: 0, output: 0, total: 0 },
      daily: [],
      lastReset: new Date(),
    };
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getDailyEntry(stats: TokenStats): DailyUsage {
    const today = this.getToday();
    let entry = stats.daily.find(d => d.date === today);
    if (!entry) {
      entry = { date: today, chat: 0, worldTick: 0, voices: 0, router: 0, total: 0 };
      stats.daily.push(entry);
      // Keep last 30 days only
      if (stats.daily.length > 30) {
        stats.daily.shift();
      }
    }
    return entry;
  }

  getStats(chatId: number): TokenStats {
    if (!this.stats.has(chatId)) {
      this.stats.set(chatId, this.createEmpty());
    }
    return this.stats.get(chatId)!;
  }

  track(
    chatId: number,
    category: 'chat' | 'worldTick' | 'voices' | 'router',
    input: number,
    output: number
  ): void {
    const stats = this.getStats(chatId);
    const total = input + output;

    // Update category totals
    stats[category].input += input;
    stats[category].output += output;
    stats[category].total += total;

    // Update overall totals
    stats.total.input += input;
    stats.total.output += output;
    stats.total.total += total;

    // Update daily
    const daily = this.getDailyEntry(stats);
    daily[category] += total;
    daily.total += total;
  }

  reset(chatId: number): void {
    this.stats.set(chatId, this.createEmpty());
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  formatStats(chatId: number): string {
    const s = this.getStats(chatId);

    // Category summary
    const lines = [
      `*Token Usage*\n`,
      `\`Chat      \` ${s.chat.total.toLocaleString().padStart(8)}`,
      `\`WorldTick \` ${s.worldTick.total.toLocaleString().padStart(8)}`,
      `\`Voices    \` ${s.voices.total.toLocaleString().padStart(8)}`,
      `\`Router    \` ${s.router.total.toLocaleString().padStart(8)}`,
      `\`──────────\``,
      `\`Total     \` ${s.total.total.toLocaleString().padStart(8)}`,
    ];

    // Daily table (last 7 days)
    const recent = s.daily.slice(-7);
    if (recent.length > 0) {
      lines.push(`\n*Daily Breakdown*\n`);
      lines.push(`\`Date       │ Tokens\``);
      lines.push(`\`───────────┼───────\``);
      for (const day of recent) {
        const dateStr = day.date.slice(5); // MM-DD
        lines.push(`\`${dateStr}      │ ${day.total.toLocaleString().padStart(6)}\``);
      }
    }

    lines.push(`\n_Since: ${s.lastReset.toLocaleDateString()}_`);
    return lines.join('\n');
  }
}

export const tokenTracker = new TokenTracker();
