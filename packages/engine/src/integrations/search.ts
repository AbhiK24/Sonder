/**
 * Web Search Integration
 *
 * Provides web search capability for agents.
 * Primary: Tavily API (designed for AI applications)
 * Fallback: DuckDuckGo Instant Answers (free, no API key)
 */

// =============================================================================
// Types
// =============================================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  answer?: string;  // Direct answer if available
  error?: string;
}

// =============================================================================
// Tavily Search (Primary)
// =============================================================================

async function searchWithTavily(query: string, maxResults = 5): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { success: false, results: [], error: 'Tavily API key not configured' };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, results: [], error: `Tavily error: ${error}` };
    }

    const data = await response.json() as {
      answer?: string;
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
      }>;
    };

    return {
      success: true,
      answer: data.answer,
      results: data.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 300),
        source: new URL(r.url).hostname,
      })),
    };
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : 'Tavily search failed' };
  }
}

// =============================================================================
// DuckDuckGo Instant Answers (Fallback - free, no API key)
// =============================================================================

async function searchWithDuckDuckGo(query: string): Promise<SearchResponse> {
  try {
    // DuckDuckGo Instant Answer API (free, no auth required)
    const encoded = encodeURIComponent(query);
    const response = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`);

    if (!response.ok) {
      return { success: false, results: [], error: 'DuckDuckGo API error' };
    }

    const data = await response.json() as {
      Abstract?: string;
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      Answer?: string;
      AnswerType?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Icon?: { URL?: string };
      }>;
    };

    const results: SearchResult[] = [];

    // Add abstract if available
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.AbstractSource || 'Wikipedia',
        url: data.AbstractURL,
        snippet: data.AbstractText.slice(0, 300),
        source: data.AbstractSource,
      });
    }

    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'DuckDuckGo',
          });
        }
      }
    }

    return {
      success: true,
      answer: data.Answer || data.AbstractText?.slice(0, 200),
      results,
    };
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : 'DuckDuckGo search failed' };
  }
}

// =============================================================================
// SerpAPI Google Search (Alternative - paid)
// =============================================================================

async function searchWithSerpAPI(query: string, maxResults = 5): Promise<SearchResponse> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return { success: false, results: [], error: 'SerpAPI key not configured' };
  }

  try {
    const encoded = encodeURIComponent(query);
    const response = await fetch(
      `https://serpapi.com/search.json?q=${encoded}&api_key=${apiKey}&num=${maxResults}`
    );

    if (!response.ok) {
      return { success: false, results: [], error: 'SerpAPI error' };
    }

    const data = await response.json() as {
      answer_box?: { answer?: string; snippet?: string };
      organic_results?: Array<{
        title: string;
        link: string;
        snippet: string;
        source?: string;
      }>;
    };

    const results: SearchResult[] = (data.organic_results || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      source: r.source,
    }));

    return {
      success: true,
      answer: data.answer_box?.answer || data.answer_box?.snippet,
      results,
    };
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : 'SerpAPI search failed' };
  }
}

// =============================================================================
// Main Search Function (cascading fallback)
// =============================================================================

/**
 * Search the web using available providers
 * Tries in order: Tavily → SerpAPI → DuckDuckGo
 */
export async function webSearch(query: string, options: {
  maxResults?: number;
  provider?: 'tavily' | 'serpapi' | 'duckduckgo' | 'auto';
} = {}): Promise<SearchResponse> {
  const { maxResults = 5, provider = 'auto' } = options;

  // Direct provider selection
  if (provider === 'tavily') {
    return searchWithTavily(query, maxResults);
  }
  if (provider === 'serpapi') {
    return searchWithSerpAPI(query, maxResults);
  }
  if (provider === 'duckduckgo') {
    return searchWithDuckDuckGo(query);
  }

  // Auto mode: try providers in order
  // 1. Try Tavily first (best for AI)
  if (process.env.TAVILY_API_KEY) {
    const result = await searchWithTavily(query, maxResults);
    if (result.success && result.results.length > 0) {
      return result;
    }
  }

  // 2. Try SerpAPI
  if (process.env.SERPAPI_KEY) {
    const result = await searchWithSerpAPI(query, maxResults);
    if (result.success && result.results.length > 0) {
      return result;
    }
  }

  // 3. Fallback to DuckDuckGo (always available, free)
  return searchWithDuckDuckGo(query);
}

/**
 * Format search results for agent display
 */
export function formatSearchResults(response: SearchResponse): string {
  if (!response.success) {
    return `Search failed: ${response.error}`;
  }

  const lines: string[] = [];

  if (response.answer) {
    lines.push(`**Answer:** ${response.answer}`);
    lines.push('');
  }

  if (response.results.length === 0) {
    lines.push('No results found.');
  } else {
    lines.push(`**Results (${response.results.length}):**`);
    for (const result of response.results) {
      lines.push(`• ${result.title}`);
      lines.push(`  ${result.snippet}`);
      lines.push(`  Source: ${result.source || new URL(result.url).hostname}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Check if web search is available
 */
export function isSearchAvailable(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.SERPAPI_KEY || true); // DuckDuckGo always available
}
