# API

IdeaScape exposes two API endpoints, used during development (Vite middleware) and production (Vercel Serverless Functions). Both are server-side proxies that keep API keys out of the client bundle.

---

## AI Generation

**`POST /api/ai/generate`**

Proxies AI chat completion requests to **NVIDIA NIM**. Available both in dev (Vite middleware) and production (Vercel Serverless Function at `api/ai/generate.ts`).

### Request Body

```json
{
  "messages": [
    { "role": "user", "content": "Summarize these ideas..." }
  ],
  "maxTokens": 600,
  "temperature": 0.7,
  "stream": false,
  "allowFallback": true,
  "model": "meta/llama-4-maverick-17b-128e-instruct"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `messages` | `Array<{role, content}>` | required | Chat messages in OpenAI format |
| `maxTokens` | number | 600 | Maximum tokens in response |
| `temperature` | number | 0.7 | Sampling temperature |
| `stream` | boolean | false | Enable streaming response |
| `allowFallback` | boolean | true | Rotate through available models on failure |
| `model` | string | `meta/llama-4-maverick-17b-128e-instruct` | Model identifier |

### Supported Models

| Model ID | Label |
|----------|-------|
| `openai/gpt-oss-120b` | GPT-OSS 120B |
| `meta/llama-4-maverick-17b-128e-instruct` | Llama 4 Maverick |
| `meta/llama-3.3-70b-instruct` | Llama 3.3 70B |
| `qwen/qwen3.5-122b-a10b` | Qwen 3.5 122B |
| `mistralai/mistral-large-3-675b-instruct-2512` | Mistral Large 3 |
| `z-ai/glm4.7` | GLM 4.7 |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Nemotron Super 49B |

### Responses

**Success (non-streaming):**

```json
{
  "content": "Here is a summary of the ideas...",
  "provider": "nvidia",
  "model": "meta/llama-4-maverick-17b-128e-instruct",
  "usedFallback": false,
  "rateLimit": {
    "used": 5,
    "remaining": 35,
    "limit": 40
  }
}
```

**Success (streaming):**

Returns newline-delimited JSON (`application/x-ndjson`):

```
{"delta":"Here","model":"meta/llama-4-maverick-17b-128e-instruct"}
{"delta":" is","model":"meta/llama-4-maverick-17b-128e-instruct"}
{"delta":" a summary...","model":"meta/llama-4-maverick-17b-128e-instruct"}
{"done":true,"model":"meta/llama-4-maverick-17b-128e-instruct"}
```

**Error:**

```json
{
  "error": "NVIDIA provider failed. Last error: ...",
  "rateLimit": { "used": 40, "remaining": 0, "limit": 40 }
}
```

### Rate Limiting

- **40 requests per minute** per instance
- Rate limit state returned in every response via `rateLimit` field
- Exceeding the limit returns a 502 with `remaining: 0`

### Authentication

- Origin validation: If `APP_ALLOWED_ORIGIN` env var is set, only requests from that origin are allowed
- CORS preflight (`OPTIONS`) is handled automatically
- No API key required on the request — the server uses `NVIDIA_API_KEY` from environment

---

## Web Search

**`POST /api/search`**

Proxies web search requests to **DuckDuckGo Instant Answer API** (free, no API key required). Available both in dev (Vite middleware) and production (Vercel Serverless Function at `api/search/index.ts`).

### Request Body

```json
{
  "query": "latest AI research papers",
  "count": 5
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | required | Search query |
| `count` | number | 5 | Number of results to return |

### Response

```json
{
  "query": "latest AI research papers",
  "results": [
    {
      "title": "Result Title",
      "url": "https://example.com/article",
      "snippet": "Description of the result..."
    }
  ],
  "answer": "Optional DuckDuckGo instant answer text",
  "summary": "Search completed with N results"
}
```

### Error

```json
{
  "error": "Search failed: error description"
}
```

Returns **502** on search failure.

---

## Dev vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Handler | Vite dev middleware (`src/server/`) | Vercel Serverless Function (`api/`) |
| URL | `http://localhost:5173/api/...` | `https://<domain>/api/...` |
| API Keys | `.env.local` | Vercel Environment Variables |
| CORS | Permissive (no origin check if `APP_ALLOWED_ORIGIN` not set) | Configurable via `APP_ALLOWED_ORIGIN` |
| AI Timeout | 11 seconds | 11 seconds (Vercel function timeout may apply) |

---

## Environment Variables Required

| Variable | Used By | Required? |
|----------|---------|-----------|
| `NVIDIA_API_KEY` | AI proxy | Yes |
| `NVIDIA_BASE_URL` | AI proxy (default: `https://integrate.api.nvidia.com/v1`) | No |
| `APP_ALLOWED_ORIGIN` | Both proxies (origin validation) | No |
