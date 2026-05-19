# Deployment

IdeaScape is a frontend SPA deployed via **Vercel** with Serverless Functions for AI and search proxy endpoints.

<!-- VERIFY: Vercel is the only deployment target configured. Other platforms (Netlify, Cloudflare Pages) require additional configuration. -->

---

## Vercel Deployment

### Prerequisites

1. A [Vercel](https://vercel.com) account
2. Git repository connected to Vercel
3. Environment variables configured in Vercel dashboard

### Configuration

The project includes `vercel.json` at the root:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

- **SPA rewrites:** All routes redirect to `/index.html` so React Router handles navigation client-side
- **Security headers:** `X-Content-Type-Options` and `Referrer-Policy` are applied globally

### Environment Variables

Set these in the Vercel dashboard (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | NVIDIA NIM API key for AI generation |
| `NVIDIA_BASE_URL` | No | Default: `https://integrate.api.nvidia.com/v1` |
| `APP_ALLOWED_ORIGIN` | No | Restrict API access to a specific origin |

### Build Settings

Vercel auto-detects the following from `package.json` and `vercel.json`:

| Setting | Detected Value |
|---------|---------------|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Serverless Functions | `api/` directory |

### Serverless Functions

Two endpoints are deployed as Vercel Serverless Functions:

| Route | File | Handler |
|-------|------|---------|
| `/api/ai/generate` | `api/ai/generate.ts` | AI generation proxy |
| `/api/search` | `api/search/index.ts` | Web search proxy |

These run in a Node.js environment on Vercel's edge network. The AI proxy has a **40 RPM** rate limit and **11-second** request timeout.

---

## Manual Deployment

### Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Or deploy to preview
vercel
```

### Via Git Push

Connect your repository to Vercel. Pushing to the production branch triggers automatic deployment.

---

## Environment Configuration

### Local Development

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

### Production

Set environment variables in the Vercel dashboard. Never commit `.env.local` or real API keys to the repository.

<!-- VERIFY: All `.env*` files are gitignored — verify via `.gitignore` -->

---

## Security Considerations

- API keys (`NVIDIA_API_KEY`) are stored server-side only — never sent to the browser
- The AI proxy validates request origin via `APP_ALLOWED_ORIGIN` env var (production)
- Security headers are configured in `vercel.json`
- CORS is enforced on the API proxy endpoints

---

## PWA

The production build includes a ServiceWorker (via `vite-plugin-pwa`) with:

- Auto-update registration
- Google Fonts runtime caching (CacheFirst, 1 year expiry)
- API routes excluded from caching (NetworkOnly)
- Precached static assets

<!-- VERIFY: PWA features require HTTPS. Vercel provides HTTPS automatically. -->
