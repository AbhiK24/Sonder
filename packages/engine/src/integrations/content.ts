/**
 * Content/RSS Integration
 *
 * Subscribe to feeds, fetch articles, curate content for angels to discuss.
 * Safety: Read-only by nature.
 */

import {
  ContentAdapter,
  FeedSource,
  FeedItem,
  IntegrationCredentials,
  IntegrationResult,
  IntegrationStatus
} from './types.js';

// =============================================================================
// RSS Parser (using built-in fetch + XML parsing)
// =============================================================================

interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  items: ParsedFeedItem[];
}

interface ParsedFeedItem {
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  author?: string;
  pubDate?: string;
  categories?: string[];
  enclosure?: { url: string; type: string };
}

async function parseFeed(url: string): Promise<ParsedFeed> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Sonder/1.0 (RSS Reader)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }

  const text = await response.text();

  // Simple XML parsing (would use a proper parser in production)
  const items: ParsedFeedItem[] = [];

  // Extract items from RSS
  const itemMatches = text.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of itemMatches) {
    const itemXml = match[1];

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const description = extractTag(itemXml, 'description');
    const content = extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content');
    const author = extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator');
    const pubDate = extractTag(itemXml, 'pubDate');

    // Extract categories
    const categories: string[] = [];
    const catMatches = itemXml.matchAll(/<category[^>]*>([^<]+)<\/category>/gi);
    for (const catMatch of catMatches) {
      categories.push(catMatch[1].trim());
    }

    if (title && link) {
      items.push({
        title: decodeHtmlEntities(title),
        link,
        content: content ? decodeHtmlEntities(content) : undefined,
        contentSnippet: description ? stripHtml(decodeHtmlEntities(description)).slice(0, 300) : undefined,
        author,
        pubDate,
        categories,
      });
    }
  }

  // Also try Atom format
  if (items.length === 0) {
    const entryMatches = text.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi);
    for (const match of entryMatches) {
      const entryXml = match[1];

      const title = extractTag(entryXml, 'title');
      const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      const link = linkMatch ? linkMatch[1] : '';
      const content = extractTag(entryXml, 'content') || extractTag(entryXml, 'summary');
      const author = extractTag(entryXml, 'name'); // Inside <author>
      const pubDate = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');

      if (title && link) {
        items.push({
          title: decodeHtmlEntities(title),
          link,
          content: content ? decodeHtmlEntities(content) : undefined,
          contentSnippet: content ? stripHtml(decodeHtmlEntities(content)).slice(0, 300) : undefined,
          author,
          pubDate,
        });
      }
    }
  }

  const feedTitle = extractTag(text, 'title') || 'Unknown Feed';
  const feedDescription = extractTag(text, 'description');
  const feedLink = extractTag(text, 'link');

  return {
    title: decodeHtmlEntities(feedTitle),
    description: feedDescription ? decodeHtmlEntities(feedDescription) : undefined,
    link: feedLink,
    items,
  };
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? (match[1] || match[2])?.trim() : undefined;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// =============================================================================
// RSS Adapter
// =============================================================================

export class RSSAdapter implements ContentAdapter {
  type = 'rss' as const;
  status: IntegrationStatus = 'disconnected';

  private sources: Map<string, FeedSource> = new Map();
  private items: Map<string, FeedItem[]> = new Map();
  private lastFetch: Date | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(_credentials: IntegrationCredentials): Promise<IntegrationResult<void>> {
    // RSS doesn't need authentication
    this.status = 'connected';
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  async healthCheck(): Promise<IntegrationResult<void>> {
    // RSS is always "healthy" if we can make HTTP requests
    try {
      await fetch('https://example.com', { method: 'HEAD' });
      return { success: true };
    } catch {
      return { success: false, error: 'Network unavailable' };
    }
  }

  // ---------------------------------------------------------------------------
  // Source Management
  // ---------------------------------------------------------------------------

  async addSource(source: Omit<FeedSource, 'id'>): Promise<IntegrationResult<FeedSource>> {
    try {
      // Validate feed by fetching it
      await parseFeed(source.url);

      const id = `feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newSource: FeedSource = {
        ...source,
        id,
        type: source.type || 'rss',
        lastFetched: undefined,
      };

      this.sources.set(id, newSource);
      this.items.set(id, []);

      return { success: true, data: newSource };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add source'
      };
    }
  }

  async getSources(): Promise<IntegrationResult<FeedSource[]>> {
    return { success: true, data: Array.from(this.sources.values()) };
  }

  async removeSource(sourceId: string): Promise<IntegrationResult<void>> {
    if (!this.sources.has(sourceId)) {
      return { success: false, error: 'Source not found' };
    }

    this.sources.delete(sourceId);
    this.items.delete(sourceId);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Fetch Operations
  // ---------------------------------------------------------------------------

  async fetchSource(sourceId: string): Promise<IntegrationResult<FeedItem[]>> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    try {
      const feed = await parseFeed(source.url);

      const items: FeedItem[] = feed.items.map((item, index) => ({
        id: `${sourceId}_${Date.now()}_${index}`,
        sourceId,
        title: item.title,
        link: item.link,
        content: item.content,
        contentSnippet: item.contentSnippet,
        author: item.author,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
        categories: item.categories,
        imageUrl: item.enclosure?.type?.startsWith('image') ? item.enclosure.url : undefined,
      }));

      // Update source
      source.lastFetched = new Date();
      this.sources.set(sourceId, source);

      // Store items
      this.items.set(sourceId, items);

      return { success: true, data: items };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch source'
      };
    }
  }

  async fetchAll(): Promise<IntegrationResult<FeedItem[]>> {
    const allItems: FeedItem[] = [];
    const errors: string[] = [];

    for (const sourceId of this.sources.keys()) {
      const result = await this.fetchSource(sourceId);
      if (result.success && result.data) {
        allItems.push(...result.data);
      } else if (result.error) {
        errors.push(`${sourceId}: ${result.error}`);
      }
    }

    this.lastFetch = new Date();

    // Sort by publish date (newest first)
    allItems.sort((a, b) => {
      const dateA = a.publishedAt?.getTime() || 0;
      const dateB = b.publishedAt?.getTime() || 0;
      return dateB - dateA;
    });

    if (errors.length > 0 && allItems.length === 0) {
      return { success: false, error: errors.join('; ') };
    }

    return { success: true, data: allItems };
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  async getItems(filter?: {
    sourceId?: string;
    since?: Date;
    limit?: number
  }): Promise<IntegrationResult<FeedItem[]>> {
    let items: FeedItem[] = [];

    if (filter?.sourceId) {
      items = this.items.get(filter.sourceId) || [];
    } else {
      for (const sourceItems of this.items.values()) {
        items.push(...sourceItems);
      }
    }

    // Filter by date
    if (filter?.since) {
      items = items.filter(item =>
        item.publishedAt && item.publishedAt >= filter.since!
      );
    }

    // Sort by date (newest first)
    items.sort((a, b) => {
      const dateA = a.publishedAt?.getTime() || 0;
      const dateB = b.publishedAt?.getTime() || 0;
      return dateB - dateA;
    });

    // Limit
    if (filter?.limit) {
      items = items.slice(0, filter.limit);
    }

    return { success: true, data: items };
  }

  // ---------------------------------------------------------------------------
  // Persistence (for sources)
  // ---------------------------------------------------------------------------

  serialize(): { sources: FeedSource[] } {
    return {
      sources: Array.from(this.sources.values()),
    };
  }

  static deserialize(data: { sources: FeedSource[] }): RSSAdapter {
    const adapter = new RSSAdapter();
    adapter.status = 'connected';

    for (const source of data.sources || []) {
      adapter.sources.set(source.id, source);
      adapter.items.set(source.id, []);
    }

    return adapter;
  }
}

// =============================================================================
// Popular Feed Presets
// =============================================================================

export const POPULAR_FEEDS = {
  // Tech
  hackerNews: {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    category: 'tech',
  },
  techCrunch: {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'tech',
  },
  theVerge: {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'tech',
  },

  // AI
  aiNews: {
    name: 'AI News',
    url: 'https://buttondown.email/ainews/rss',
    category: 'ai',
  },

  // Productivity
  zenHabits: {
    name: 'Zen Habits',
    url: 'https://zenhabits.net/feed/',
    category: 'productivity',
  },

  // Business
  stratechery: {
    name: 'Stratechery',
    url: 'https://stratechery.com/feed/',
    category: 'business',
  },
};

// =============================================================================
// Factory
// =============================================================================

export function createContentAdapter(type: 'rss'): ContentAdapter {
  switch (type) {
    case 'rss':
      return new RSSAdapter();
    default:
      throw new Error(`Unknown content adapter type: ${type}`);
  }
}
