/**
 * Web Search Integration
 *
 * Provides web search capability for agents.
 * Primary: Tavily API (designed for AI applications)
 * Fallback: DuckDuckGo Instant Answers (free, no API key)
 */

// =============================================================================
// Helpers
// =============================================================================

/**
 * Safely extract hostname from URL
 */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

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
        source: safeHostname(r.url),
      })),
    };
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : 'Tavily search failed' };
  }
}

// =============================================================================
// DuckDuckGo HTML Search (Fallback - free, no API key)
// =============================================================================

async function searchWithDuckDuckGo(query: string): Promise<SearchResponse> {
  try {
    // Use DuckDuckGo HTML search (lite version)
    const encoded = encodeURIComponent(query);
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return { success: false, results: [], error: 'DuckDuckGo search failed' };
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse search results from HTML
    // Results are in <a class="result__a"> with href and title
    // Snippets are in <a class="result__snippet">
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/g;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      let url = match[1];
      const title = match[2].trim();
      const snippet = match[3].trim();

      // DuckDuckGo uses redirect URLs, extract actual URL
      if (url.includes('uddg=')) {
        const urlMatch = url.match(/uddg=([^&]*)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          url,
          snippet: snippet.slice(0, 300),
          source: safeHostname(url),
        });
      }
    }

    // If regex didn't work, try simpler pattern
    if (results.length === 0) {
      const simpleRegex = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
      while ((match = simpleRegex.exec(html)) !== null && results.length < 5) {
        const url = match[1];
        const domain = match[2].trim();
        if (url && url.startsWith('http')) {
          results.push({
            title: domain,
            url,
            snippet: 'Search result from ' + domain,
            source: domain,
          });
        }
      }
    }

    return {
      success: true,
      results,
      answer: results.length > 0 ? results[0].snippet : undefined,
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
// Perplexity Search (Best for AI - returns synthesized answers)
// =============================================================================

async function searchWithPerplexity(query: string): Promise<SearchResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return { success: false, results: [], error: 'Perplexity API key not configured' };
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online', // Online model with search
        messages: [
          {
            role: 'system',
            content: 'You are a helpful search assistant. Provide specific, factual answers with sources. Be concise but comprehensive.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 1000,
        return_citations: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, results: [], error: `Perplexity error: ${error}` };
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };

    const answer = data.choices[0]?.message?.content || '';
    const citations = data.citations || [];

    // Convert citations to search results
    const results: SearchResult[] = citations.slice(0, 5).map((url, i) => ({
      title: `Source ${i + 1}`,
      url,
      snippet: '',
      source: safeHostname(url),
    }));

    return {
      success: true,
      answer,
      results,
    };
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : 'Perplexity search failed' };
  }
}

// =============================================================================
// Main Search Function (cascading fallback)
// =============================================================================

/**
 * Search the web using available providers
 * Tries in order: Perplexity → Tavily → SerpAPI → DuckDuckGo
 */
export async function webSearch(query: string, options: {
  maxResults?: number;
  provider?: 'perplexity' | 'tavily' | 'serpapi' | 'duckduckgo' | 'auto';
} = {}): Promise<SearchResponse> {
  const { maxResults = 5, provider = 'auto' } = options;

  // Direct provider selection
  if (provider === 'perplexity') {
    return searchWithPerplexity(query);
  }
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
  // 1. Try Perplexity first (best quality, synthesized answers)
  if (process.env.PERPLEXITY_API_KEY) {
    const result = await searchWithPerplexity(query);
    if (result.success && (result.answer || result.results.length > 0)) {
      return result;
    }
  }

  // 2. Try Tavily (good for AI)
  if (process.env.TAVILY_API_KEY) {
    const result = await searchWithTavily(query, maxResults);
    if (result.success && result.results.length > 0) {
      return result;
    }
  }

  // 3. Try SerpAPI
  if (process.env.SERPAPI_KEY) {
    const result = await searchWithSerpAPI(query, maxResults);
    if (result.success && result.results.length > 0) {
      return result;
    }
  }

  // 4. Fallback to DuckDuckGo (always available, free but poor quality)
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
      lines.push(`  Source: ${result.source || safeHostname(result.url)}`);
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
