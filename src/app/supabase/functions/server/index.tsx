import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from './kv_store.tsx';

const app = new Hono();
const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN")?.trim() || "*";

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: allowedOrigin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-832115ea/health", (c) => {
  return c.json({ status: "ok", message: "IdeaScape server is running (demo mode - collaboration disabled)" });
});

// ── AI Proxy endpoint ─────────────────────────────────────────────────────
// Keeps API keys on the server. The client POSTs to this route and the
// server forwards the request to NVIDIA NIM.

const NVIDIA_MODELS = new Set([
  "openai/gpt-oss-120b",
  "meta/llama-4-maverick-17b-128e-instruct",
  "meta/llama-3.3-70b-instruct",
  "qwen/qwen3.5-122b-a10b",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "z-ai/glm4.7",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
]);
const NVIDIA_DEFAULT = "meta/llama-4-maverick-17b-128e-instruct";
const DEEPSEEK_V4_MODELS = new Set<string>();

const AI_TIMEOUT_MS = 11_000;
const AI_RPM_LIMIT = 40;
let aiRequestTimestamps: number[] = [];

function pruneAiRequestTimestamps() {
  const cutoff = Date.now() - 60_000;
  aiRequestTimestamps = aiRequestTimestamps.filter((ts) => ts >= cutoff);
}

function recordAiRequest() {
  pruneAiRequestTimestamps();
  aiRequestTimestamps.push(Date.now());
}

function getAiRateLimitSnapshot() {
  pruneAiRequestTimestamps();
  const used = aiRequestTimestamps.length;
  return {
    used,
    remaining: Math.max(0, AI_RPM_LIMIT - used),
    limit: AI_RPM_LIMIT,
  };
}

function getProviderConfig(
  provider: "nvidia",
  requestedModel?: string,
): { baseUrl: string; headers: Record<string, string>; model: string; extraBody?: Record<string, unknown> } | null {
  const key = Deno.env.get("NVIDIA_API_KEY")?.trim();
  if (!key) return null;
  const base = (Deno.env.get("NVIDIA_BASE_URL")?.trim() || "https://integrate.api.nvidia.com/v1") + "/chat/completions";
  const model = (requestedModel && NVIDIA_MODELS.has(requestedModel)) ? requestedModel : NVIDIA_DEFAULT;
  const extraBody = DEEPSEEK_V4_MODELS.has(model) ? { chat_template_kwargs: { thinking: true } } : undefined;
  return { baseUrl: base, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, model, extraBody };
}

app.post("/make-server-832115ea/api/ai/generate", async (c) => {
  try {
    const body = await c.req.json();
    const { messages, maxTokens = 600, temperature = 0.7, model: requestedModel } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: "messages array is required" }, 400);
    }

    if (!Deno.env.get("NVIDIA_API_KEY")?.trim()) {
      return c.json({ error: "NVIDIA API key not configured" }, 502);
    }

    const startModel = requestedModel && NVIDIA_MODELS.has(requestedModel) ? requestedModel : NVIDIA_DEFAULT;
    const rotation = body.allowFallback === false
      ? [startModel]
      : [startModel, ...Array.from(NVIDIA_MODELS).filter((model) => model !== startModel)];
    let lastError = "";

    for (let i = 0; i < rotation.length; i++) {
      const cfg = getProviderConfig("nvidia", rotation[i]);
      if (!cfg) {
        return c.json({ error: "NVIDIA API key not configured" }, 502);
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

      const payload: Record<string, unknown> = {
        model: cfg.model, messages, max_tokens: maxTokens, temperature, top_p: 0.95,
        ...cfg.extraBody,
      };

      try {
        recordAiRequest();
        const res = await fetch(cfg.baseUrl, {
          method: "POST",
          headers: cfg.headers,
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          lastError = `NVIDIA ${res.status}: ${await res.text().catch(() => res.statusText)}`;
          continue;
        }

        const data = await res.json();
        const msg = data?.choices?.[0]?.message;
        const content = msg?.content?.trim() || msg?.reasoning_content?.trim() || msg?.reasoning?.trim();
        if (!content) {
          lastError = "NVIDIA returned empty content";
          continue;
        }

        return c.json({ content, provider: "nvidia", model: cfg.model, usedFallback: i > 0, rateLimit: getAiRateLimitSnapshot() });
      } catch (error) {
        clearTimeout(timer);
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return c.json({ error: `NVIDIA provider failed. Last error: ${lastError}`, rateLimit: getAiRateLimitSnapshot() }, 502);
  } catch (error) {
    return c.json({ error: `Server error: ${error.message}` }, 500);
  }
});

// Demo mode - all collaboration endpoints return not implemented
app.all("/make-server-832115ea/canvas/*", (c) => {
  return c.json({ 
    error: "Collaboration features are disabled in demo mode",
    message: "This is a demo deployment. Real-time collaboration is not available."
  }, 501);
});

// Browser session storage endpoints
app.post("/make-server-832115ea/browser-session", async (c) => {
  try {
    const body = await c.req.json();
    const { action, key, data } = body;

    if (action === 'save') {
      await kv.set(key, JSON.stringify(data));
      return c.json({ success: true, message: 'Session saved' });
    }

    return c.json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Error saving browser session:', error);
    return c.json({ error: 'Failed to save session', details: error.message }, 500);
  }
});

app.get("/make-server-832115ea/browser-session", async (c) => {
  try {
    const key = c.req.query('key');
    
    if (!key) {
      return c.json({ error: 'Missing key parameter' }, 400);
    }

    const data = await kv.get(key);
    
    if (!data) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json(JSON.parse(data));
  } catch (error) {
    console.error('Error loading browser session:', error);
    return c.json({ error: 'Failed to load session', details: error.message }, 500);
  }
});

app.delete("/make-server-832115ea/browser-session", async (c) => {
  try {
    const body = await c.req.json();
    const { key } = body;

    if (!key) {
      return c.json({ error: 'Missing key' }, 400);
    }

    await kv.del(key);
    return c.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('Error deleting browser session:', error);
    return c.json({ error: 'Failed to delete session', details: error.message }, 500);
  }
});

Deno.serve(app.fetch);