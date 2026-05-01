/**
 * Server-side AI proxy handler.
 *
 * Runs inside the Vite dev-server (Node.js) so it has access to env vars
 * that are NOT prefixed with VITE_ and therefore never shipped to the browser.
 *
 * NVIDIA NIM is the only supported provider in this build.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface AIProxyRequest {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  allowFallback?: boolean;
  stream?: boolean;
  provider?: 'nvidia';
  model?: string;
}

interface AIProxySuccess {
  content: string;
  provider: 'nvidia';
  model: string;
  usedFallback: boolean;
  rateLimit?: {
    used: number;
    remaining: number;
    limit: number;
  };
}

interface AIProxyError {
  error: string;
  rateLimit?: {
    used: number;
    remaining: number;
    limit: number;
  };
}

type AIProxyResponse = AIProxySuccess | AIProxyError;

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export const NVIDIA_MODELS: Record<string, { label: string; reasoning?: boolean }> = {
  'openai/gpt-oss-120b': { label: 'GPT-OSS 120B' },
  'meta/llama-4-maverick-17b-128e-instruct': { label: 'Llama 4 Maverick' },
  'meta/llama-3.3-70b-instruct': { label: 'Llama 3.3 70B' },
  'qwen/qwen3.5-122b-a10b': { label: 'Qwen 3.5 122B' },
  'mistralai/mistral-large-3-675b-instruct-2512': { label: 'Mistral Large 3' },
  'z-ai/glm4.7': { label: 'GLM 4.7' },
  'nvidia/llama-3.3-nemotron-super-49b-v1.5': { label: 'Nemotron Super 49B' },
};

const NVIDIA_DEFAULT_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';
const REQUEST_TIMEOUT_MS = 11_000;
const RPM_LIMIT = 40;
let providerRequestTimestamps: number[] = [];

function pruneProviderRequestTimestamps() {
  const cutoff = Date.now() - 60_000;
  providerRequestTimestamps = providerRequestTimestamps.filter((ts) => ts >= cutoff);
}

function recordProviderRequest() {
  pruneProviderRequestTimestamps();
  providerRequestTimestamps.push(Date.now());
}

function getProviderRateLimitSnapshot() {
  pruneProviderRequestTimestamps();
  const used = providerRequestTimestamps.length;
  return {
    used,
    remaining: Math.max(0, RPM_LIMIT - used),
    limit: RPM_LIMIT,
  };
}

function buildProviderConfig(
  env: Record<string, string | undefined>,
  requestedModel?: string,
): ProviderConfig | null {
  const apiKey = env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1') + '/chat/completions';
  const model = requestedModel && requestedModel in NVIDIA_MODELS ? requestedModel : NVIDIA_DEFAULT_MODEL;

  const config: ProviderConfig = {
    baseUrl,
    apiKey,
    model,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (NVIDIA_MODELS[model]?.reasoning) {
    config.extraBody = {
      chat_template_kwargs: { thinking: true },
    };
  }

  return config;
}

async function callProvider(config: ProviderConfig, body: AIProxyRequest): Promise<string> {
  recordProviderRequest();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: body.messages,
      max_tokens: body.maxTokens ?? 600,
      temperature: body.temperature ?? 0.7,
      top_p: 0.95,
      ...config.extraBody,
    };

    const res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`nvidia ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = extractContent(data);
    if (!content) {
      throw new Error('nvidia returned empty or unparseable response');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callProviderStream(config: ProviderConfig, body: AIProxyRequest): Promise<Response> {
  recordProviderRequest();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: body.messages,
      max_tokens: body.maxTokens ?? 600,
      temperature: body.temperature ?? 0.7,
      top_p: 0.95,
      stream: true,
      ...config.extraBody,
    };

    const res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`nvidia ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error('nvidia returned empty stream');
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function forwardSseAsJsonLines(response: Response, res: ServerResponse, model: string) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const event = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf('\n\n');

      for (const line of event.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          res.write(`${JSON.stringify({ done: true, model })}\n`);
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            parsed?.choices?.[0]?.text ??
            '';

          if (typeof delta === 'string' && delta.length > 0) {
            res.write(`${JSON.stringify({ delta, model })}\n`);
          }
        } catch {
          continue;
        }
      }
    }
  }
}

function extractContent(data: any): string | null {
  const msg = data?.choices?.[0]?.message;
  if (msg?.content && msg.content.trim().length > 0) return msg.content.trim();
  if (msg?.reasoning_content && msg.reasoning_content.trim().length > 0) return msg.reasoning_content.trim();
  if (msg?.reasoning && msg.reasoning.trim().length > 0) return msg.reasoning.trim();

  for (const key of ['content', 'text', 'response', 'message'] as const) {
    if (typeof data?.[key] === 'string' && data[key].trim()) {
      return data[key].trim();
    }
  }

  if (typeof data === 'string' && data.trim()) return data.trim();
  return null;
}

export function createAIProxyHandler(env: Record<string, string | undefined>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
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

    let body: AIProxyRequest;
    try {
      body = await parseBody<AIProxyRequest>(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      sendJson(res, 400, { error: 'messages array is required' });
      return;
    }

    const requestedModel = body.model && body.model in NVIDIA_MODELS ? body.model : NVIDIA_DEFAULT_MODEL;
    const rotation = body.allowFallback === false
      ? [requestedModel]
      : [
          requestedModel,
          ...Object.keys(NVIDIA_MODELS).filter((model) => model !== requestedModel),
        ];

    if (!env.NVIDIA_API_KEY?.trim()) {
      sendJson(res, 502, { error: 'NVIDIA API key not configured' });
      return;
    }

    let lastError = '';

    for (let i = 0; i < rotation.length; i++) {
      const model = rotation[i];
      const config = buildProviderConfig(env, model);
      if (!config) {
        sendJson(res, 502, { error: 'NVIDIA API key not configured' });
        return;
      }

      try {
        if (body.stream) {
          const providerResponse = await callProviderStream(config, body);
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          await forwardSseAsJsonLines(providerResponse, res, config.model);
          res.end();
          return;
        }

        const content = await callProvider(config, body);
        sendJson(res, 200, {
          content,
          provider: 'nvidia',
          model: config.model,
          usedFallback: i > 0,
          rateLimit: getProviderRateLimitSnapshot(),
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    sendJson(res, 502, {
      error: `NVIDIA provider failed. Last error: ${lastError}`,
      rateLimit: getProviderRateLimitSnapshot(),
    });
  };
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

function sendJson(res: ServerResponse, status: number, data: AIProxyResponse) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}
