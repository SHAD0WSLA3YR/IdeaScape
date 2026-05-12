/**
 * Server-side Search Proxy Handler
 * 
 * Provides web search capability via DuckDuckGo Instant Answer API (free, no API key required)
 * Can be extended to use other search APIs (Bing, SerpAPI, etc.)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

interface SearchRequest {
  query: string;
  count?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  answer?: string; // DuckDuckGo instant answer
  summary: string;
}

interface SearchError {
  error: string;
}

const DUCKDUCKGO_API = 'https://api.duckduckgo.com/';
const DUCKDUCKGO_HTML = 'https://html.duckduckgo.com/html/';
const SEARCH_TIMEOUT_MS = 10000;

export function createSearchProxyHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    let body: SearchRequest;
    try {
      body = await parseBody<SearchRequest>(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
      sendJson(res, 400, { error: 'query string is required' });
      return;
    }

    const query = body.query.trim();
    const count = Math.min(body.count || 5, 10); // Max 10 results

    try {
      const searchResults = await searchDuckDuckGo(query, count);
      
      sendJson(res, 200, {
        query,
        results: searchResults.results,
        answer: searchResults.answer,
        summary: searchResults.summary,
      } as SearchResponse);
    } catch (err) {
      console.error('[Search Proxy] Search failed:', err);
      sendJson(res, 502, { 
        error: `Search failed: ${err instanceof Error ? err.message : String(err)}` 
      } as SearchError);
    }
  };
}

async function searchDuckDuckGo(query: string, count: number): Promise<SearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    // DuckDuckGo Instant Answer API (free, no API key)
    const url = new URL(DUCKDUCKGO_API);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'IdeaScape/1.0 (Web Search Bot)',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract results
    const results: SearchResult[] = [];
    const summaryParts: string[] = [];

    // Instant answer (if available)
    let answer: string | undefined;
    if (data.AbstractText) {
      answer = data.AbstractText;
      summaryParts.push(answer);
      
      if (data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, count - results.length).forEach((topic: any) => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
          });
          summaryParts.push(topic.Text);
        }
      });
    }

    if (results.length === 0) {
      const weather = await maybeSearchWeather(query);
      if (weather) {
        return weather;
      }

      const htmlResults = await searchDuckDuckGoHtml(query, count);
      results.push(...htmlResults.results);
      summaryParts.push(...htmlResults.summaryParts);
    }

    if (results.length === 0) {
      summaryParts.push(`No direct results found for "${query}". The search source may be rate-limited or the query may need refinement.`);
    }

    const summary = summaryParts.slice(0, 3).join(' ');

    return {
      query,
      results: results.slice(0, count),
      answer,
      summary: summary || `Search completed for "${query}" but no summary available.`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Search request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGoHtml(
  query: string,
  count: number,
): Promise<{ results: SearchResult[]; summaryParts: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(DUCKDUCKGO_HTML, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 IdeaScape/1.0',
      },
      body: new URLSearchParams({ q: query }).toString(),
    });

    if (!response.ok) return { results: [], summaryParts: [] };

    const html = await response.text();
    const results: SearchResult[] = [];
    const resultPattern =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    for (const match of html.matchAll(resultPattern)) {
      const url = decodeDuckDuckGoUrl(decodeHtml(match[1]));
      const title = decodeHtml(stripTags(match[2]));
      const snippet = decodeHtml(stripTags(match[3]));
      if (!title || !url) continue;
      results.push({ title, url, snippet });
      if (snippet) {
        // Keep direct output concise; detailed snippets remain in results.
      }
      if (results.length >= count) break;
    }

    return {
      results,
      summaryParts: results.length
        ? [`Found ${results.length} web result${results.length === 1 ? '' : 's'} for "${query}".`]
        : [],
    };
  } catch {
    return { results: [], summaryParts: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function maybeSearchWeather(query: string): Promise<SearchResponse | null> {
  if (!/\b(weather|temp|temperature|forecast)\b/i.test(query)) return null;

  const location = extractWeatherLocation(query);
  if (!location) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=3`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'IdeaScape/1.0' },
    });

    if (!response.ok) return null;

    const answer = (await response.text()).trim();
    if (!answer || /unknown location/i.test(answer)) return null;

    return {
      query,
      answer,
      summary: answer,
      results: [
        {
          title: `Weather for ${location}`,
          url: `https://wttr.in/${encodeURIComponent(location)}`,
          snippet: answer,
        },
      ],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractWeatherLocation(query: string): string {
  return query
    .replace(/\b(what'?s|what is|show me|tell me|please|current|right now|today)\b/gi, ' ')
    .replace(/\b(the )?(weather|temp|temperature|forecast)\b/gi, ' ')
    .replace(/\b(in|for|at|near)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDuckDuckGoUrl(url: string): string {
  try {
    if (url.startsWith('//')) return `https:${url}`;
    const parsed = new URL(url, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return url;
  }
}

function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}
