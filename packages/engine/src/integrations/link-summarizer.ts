/**
 * Link Summarizer Integration
 *
 * Fetches and extracts content from URLs, then summarizes using LLM.
 * Supports:
 * - Regular web articles
 * - X/Twitter posts and threads
 * - YouTube videos (title, description - transcript access is limited)
 */

// =============================================================================
// Types
// =============================================================================

export interface LinkContent {
  url: string;
  type: 'article' | 'tweet' | 'thread' | 'youtube' | 'unknown';
  title?: string;
  author?: string;
  content: string;
  publishedAt?: Date;
  images?: string[];
}

export interface SummarizeResult {
  success: boolean;
  summary?: string;
  title?: string;
  author?: string;
  type?: string;
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const FETCH_TIMEOUT_MS = 15000; // 15 second timeout for all fetches

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithTimeout(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// URL Type Detection
// =============================================================================

function detectUrlType(url: string): 'twitter' | 'youtube' | 'article' {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube';
  }
  return 'article';
}

// =============================================================================
// Twitter/X Content Fetcher
// =============================================================================

async function fetchTwitterContent(url: string): Promise<LinkContent | null> {
  // Try multiple methods to get Twitter content

  // Method 1: Use fxtwitter/vxtwitter (embed service with better scraping)
  const tweetUrl = url.replace('twitter.com', 'api.fxtwitter.com').replace('x.com', 'api.fxtwitter.com');

  try {
    const response = await fetchWithTimeout(tweetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Sonder/1.0)',
      },
    });

    if (response.ok) {
      const data = await response.json() as {
        tweet?: {
          text: string;
          author: { name: string; screen_name: string };
          created_at: string;
          replies?: number;
          likes?: number;
          retweets?: number;
        };
      };

      if (data.tweet) {
        return {
          url,
          type: 'tweet',
          title: `Tweet by @${data.tweet.author.screen_name}`,
          author: `${data.tweet.author.name} (@${data.tweet.author.screen_name})`,
          content: data.tweet.text,
          publishedAt: new Date(data.tweet.created_at),
        };
      }
    }
  } catch {
    // fxtwitter failed, try alternative
  }

  // Method 2: Try Nitter (self-hosted Twitter frontend)
  const nitterInstances = [
    'nitter.net',
    'nitter.privacydev.net',
    'nitter.poast.org',
  ];

  for (const nitter of nitterInstances) {
    try {
      const nitterUrl = url
        .replace('twitter.com', nitter)
        .replace('x.com', nitter);

      const response = await fetchWithTimeout(nitterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const html = await response.text();

        // Extract tweet content from Nitter HTML
        const contentMatch = html.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const authorMatch = html.match(/<a class="fullname"[^>]*>([^<]+)<\/a>/);
        const usernameMatch = html.match(/<a class="username"[^>]*>@([^<]+)<\/a>/);

        if (contentMatch) {
          const text = contentMatch[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();

          const author = authorMatch ? authorMatch[1].trim() : 'Unknown';
          const username = usernameMatch ? usernameMatch[1].trim() : '';

          return {
            url,
            type: 'tweet',
            title: `Tweet by @${username || 'unknown'}`,
            author: username ? `${author} (@${username})` : author,
            content: text,
          };
        }
      }
    } catch {
      // This Nitter instance failed, try next
    }
  }

  // Method 3: Fallback to basic scraping
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });

    if (response.ok) {
      const html = await response.text();

      // Try to extract from meta tags
      const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
      const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);

      if (ogDescMatch) {
        return {
          url,
          type: 'tweet',
          title: ogTitleMatch ? ogTitleMatch[1] : 'Tweet',
          content: ogDescMatch[1],
        };
      }
    }
  } catch {
    // All methods failed
  }

  return null;
}

// =============================================================================
// Article Content Fetcher (using Jina Reader API)
// =============================================================================

async function fetchArticleContent(url: string): Promise<LinkContent | null> {
  // Method 1: Try Jina Reader API (best for articles, free tier available)
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetchWithTimeout(jinaUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json() as {
        data?: {
          title?: string;
          description?: string;
          content?: string;
          author?: string;
          publishedTime?: string;
        };
      };

      if (data.data?.content) {
        return {
          url,
          type: 'article',
          title: data.data.title,
          author: data.data.author,
          content: data.data.content,
          publishedAt: data.data.publishedTime ? new Date(data.data.publishedTime) : undefined,
        };
      }
    }
  } catch {
    // Jina failed, try alternative
  }

  // Method 2: Direct fetch with basic HTML parsing
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Extract metadata
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                       html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const authorMatch = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i) ||
                        html.match(/<meta[^>]*property="article:author"[^>]*content="([^"]+)"/i);
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);

    // Try to extract article content
    // Look for common article containers
    let content = '';

    // Try article tag first
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    } else {
      // Try main content div patterns
      const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                        html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (mainMatch) {
        content = mainMatch[1];
      }
    }

    // Clean HTML content
    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    // If we couldn't extract content, use description
    if (!content && descMatch) {
      content = descMatch[1];
    }

    // Limit content length for LLM
    const maxLength = 15000;
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + '...';
    }

    if (!content) {
      return null;
    }

    return {
      url,
      type: 'article',
      title: titleMatch ? titleMatch[1].trim() : undefined,
      author: authorMatch ? authorMatch[1].trim() : undefined,
      content,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// YouTube Content Fetcher
// =============================================================================

async function fetchYouTubeContent(url: string): Promise<LinkContent | null> {
  // Extract video ID
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) {
    return null;
  }

  const videoId = videoIdMatch[1];
  let title = '';
  let author = '';
  let description = '';

  // Get video metadata via oEmbed API
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetchWithTimeout(oembedUrl);

    if (response.ok) {
      const data = await response.json() as {
        title: string;
        author_name: string;
        author_url: string;
      };
      title = data.title;
      author = data.author_name;
    }
  } catch {
    // oEmbed failed, continue anyway
  }

  // Try to get description from page
  try {
    const pageResponse = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      const descMatch = html.match(/"description":{"simpleText":"([^"]+)"}/);
      if (descMatch) {
        description = descMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\u0026/g, '&');
      }
    }
  } catch {
    // Couldn't get description
  }

  if (!title) {
    return null;
  }

  // Be honest about limitations
  const content = description
    ? `DESCRIPTION:\n${description}\n\n(Note: I can only see the video's description, not its actual content. For a proper summary, I would need transcript access which is currently unavailable.)`
    : `(Note: I can only see this video's title. I cannot access the actual video content or transcript.)`;

  return {
    url,
    type: 'youtube',
    title: title,
    author: author || 'Unknown Channel',
    content,
  };
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Fetch content from a URL
 */
export async function fetchLinkContent(url: string): Promise<LinkContent | null> {
  // Validate URL
  try {
    new URL(url);
  } catch {
    return null;
  }

  const urlType = detectUrlType(url);

  switch (urlType) {
    case 'twitter':
      return fetchTwitterContent(url);
    case 'youtube':
      return fetchYouTubeContent(url);
    default:
      return fetchArticleContent(url);
  }
}

/**
 * Summarize a link using provided LLM function
 */
export async function summarizeLink(
  url: string,
  llmFn: (prompt: string) => Promise<string>
): Promise<SummarizeResult> {
  // Fetch content
  const content = await fetchLinkContent(url);

  if (!content) {
    return {
      success: false,
      error: `Could not fetch content from ${url}. The site may be blocking access.`,
    };
  }

  // Build prompt based on content type
  let prompt: string;

  if (content.type === 'tweet') {
    prompt = `Summarize this tweet/thread. Include the key point and any important context.

Author: ${content.author || 'Unknown'}
Content:
${content.content}

Provide a concise summary (2-3 sentences). If it's a thread or has multiple parts, capture the main argument.`;
  } else if (content.type === 'youtube') {
    // YouTube: We only have title + description (no transcript access)
    prompt = `I have limited information about this YouTube video (title and description only - no transcript access).

Title: ${content.title}
Channel: ${content.author || 'Unknown'}

${content.content}

Based on this metadata, provide:
1. What the video appears to be about (based on title)
2. Any details from the description if available
3. Be HONEST that this is based on metadata, not actual video content

DO NOT make up or hallucinate what the video says - only report what's in the title/description.`;
  } else {
    prompt = `Summarize this article. Focus on the key points and main argument.

${content.title ? `Title: ${content.title}` : ''}
${content.author ? `Author: ${content.author}` : ''}

Content:
${content.content}

Provide a clear, concise summary (3-5 sentences) covering:
1. The main topic/thesis
2. Key supporting points
3. Any notable conclusions`;
  }

  try {
    const summary = await llmFn(prompt);

    return {
      success: true,
      summary,
      title: content.title,
      author: content.author,
      type: content.type,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate summary',
    };
  }
}
