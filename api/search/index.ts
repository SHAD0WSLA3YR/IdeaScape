/**
 * Vercel Serverless Search Proxy
 *
 * Production equivalent of the Vite dev middleware from src/server/searchProxy.ts.
 * Provides web search capability via DuckDuckGo Instant Answer API.
 *
 * Deployed at: /api/search
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Types ──────────────────────────────────────────────────────────────

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
  answer?: string;
  summary: string;
}

interface SearchError {
  error: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const DUCKDUCKGO_API = 'https://api.duckduckgo.com/';
const SEARCH_TIMEOUT_MS = 10000;

// ── Origin Validation ──────────────────────────────────────────────────

function validateOrigin(req: IncomingMessage): { valid: boolean; allowedOrigin: string } {
  const allowedOrigin = process.env.APP_ALLOWED_ORIGIN?.trim();
  if (!allowedOrigin) {
    return { valid: true, allowedOrigin: '*' };
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    return { valid: true, allowedOrigin: allowedOrigin };
  }

  const originStr = typeof origin === 'string' ? origin : origin[0];
  if (originStr === allowedOrigin || originStr.startsWith(allowedOrigin)) {
    return { valid: true, allowedOrigin: allowedOrigin };
  }

  return { valid: false, allowedOrigin: allowedOrigin };
}

// ── Search Implementation ──────────────────────────────────────────────

async function searchDuckDuckGo(query: string, count: number): Promise<SearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
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
      summaryParts.push(`No direct results found for "${query}". The search API may be rate-limited or the query may need refinement.`);
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

// ── Helpers ────────────────────────────────────────────────────────────

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

function sendJson(res: ServerResponse, status: number, data: SearchResponse | SearchError, allowedOrigin: string) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
  });
  res.end(JSON.stringify(data));
}

// ── Main Handler ───────────────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Origin validation
  const originCheck = validateOrigin(req);
  if (!originCheck.valid) {
    sendJson(res, 403, { error: 'Origin not allowed' }, originCheck.allowedOrigin);
    return;
  }

  const allowedOrigin = originCheck.allowedOrigin;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, allowedOrigin);
    return;
  }

  let body: SearchRequest;
  try {
    body = await parseBody<SearchRequest>(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' }, allowedOrigin);
    return;
  }

  if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
    sendJson(res, 400, { error: 'query string is required' }, allowedOrigin);
    return;
  }

  const query = body.query.trim();
  const count = Math.min(body.count || 5, 10);

  try {
    const searchResults = await searchDuckDuckGo(query, count);

    sendJson(res, 200, {
      query,
      results: searchResults.results,
      answer: searchResults.answer,
      summary: searchResults.summary,
    }, allowedOrigin);
  } catch (err) {
    console.error('[Search Proxy] Search failed:', err);
    sendJson(res, 502, {
      error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
    }, allowedOrigin);
  }
}
