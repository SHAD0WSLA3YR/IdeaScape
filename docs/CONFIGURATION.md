# Configuration

IdeaScape uses several configuration files at the project root for build, test, deployment, and runtime settings.

---

## Build & Dev Server

### `vite.config.ts`

The primary build configuration for Vite 6. Key sections:

| Setting | Value | Purpose |
|---------|-------|---------|
| Plugins | `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa` | React JSX transform, Tailwind CSS 4 processing, PWA ServiceWorker |
| `resolve.alias` | `@` → `./src` | Import path alias (e.g. `import { x } from '@/components/...'`) |
| Dev middleware | `/api/ai/generate`, `/api/search` | Server-side proxy handlers that keep API keys off the client bundle |
| `build.chunkSizeWarningLimit` | 900 kB | Custom warning threshold for large chunks |
| `build.rollupOptions.output.manualChunks` | vendor, vendor-charts, vendor-export | Chunk splitting strategy for caching optimization |

**To modify:** Edit `vite.config.ts` directly. Changes take effect on next dev server restart or build.

### `postcss.config.mjs`

Currently an empty configuration — Tailwind CSS 4 is processed entirely through the `@tailwindcss/vite` plugin in Vite, so no PostCSS plugins are needed. If you add PostCSS plugins in the future, register them here.

---

## Package Configuration

### `package.json`

| Field | Value |
|-------|-------|
| Name | `ideascape` |
| Version | `0.0.1` |
| Type | `module` (ESM) |
| Package manager | npm (lockfile: `package-lock.json`) |

**Scripts:**

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Start development server with HMR |
| `build` | `vite build` | Production build |
| `test` | `vitest` | Run test suite |

**Dependencies:** 55+ runtime dependencies including React 18, Zustand, Supabase JS client, Radix UI primitives, Tailwind CSS 4, Motion (Framer Motion), and various utility libraries.

**Dev Dependencies:** Vite 6, Vitest, jsdom, Tailwind CSS 4, `@vitejs/plugin-react`, `vite-plugin-pwa`.

**Peer Dependencies:** React 18.3 (marked optional — the app bundles its own React via dependencies).

<!-- VERIFY: pnpm overrides section pins vite to 6.3.5 -->

---

## TypeScript

TypeScript is configured through Vite's built-in TypeScript support. No standalone `tsconfig.json` exists — TypeScript compiler options are inherited from Vite's defaults (strict mode, ESNext target, JSX preserve).

An `eslint.config.js` file configures linting with `typescript-eslint`:

- `@typescript-eslint/no-unused-vars`: warn (with `argsIgnorePattern: '^_'`)
- `@typescript-eslint/no-explicit-any`: warn

---

## Testing

### `vitest.config.ts`

| Setting | Value |
|---------|-------|
| Environment | `jsdom` (browser-like globals) |
| Globals | `true` (describe/it/expect available without import) |
| Setup files | `./vitest.setup.ts` |
| Test file pattern | `src/**/*.test.ts` |
| Pool | Threads (single-threaded) |

### `vitest.setup.ts`

Provides a mock `localStorage` implementation using an in-memory `Map`, replacing the native `Storage` API. Clears storage before each test via `beforeEach`.

**To add tests:** Create a `*.test.ts` file under `src/` matching any of the existing test patterns (`src/app/store/canvasStore.test.ts`, `src/server/aiProxy.test.ts`, etc.).

---

## Environment Variables

### `.env.example`

Template for required environment variables:

```env
# NVIDIA NIM API (primary provider)
NVIDIA_API_KEY=nvapi-xxx
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# OpenRouter API (legacy — currently unused)
OPENROUTER_API_KEY=sk-or-v1-xxx
```

**Usage:**
1. Copy `.env.example` to `.env.local`
2. Fill in real API key values
3. Never commit `.env.local` — it is gitignored

Non-`VITE_` prefixed variables stay server-side only. They are loaded by Vite's `loadEnv('', process.cwd(), '')` (empty prefix, so ALL variables are loaded) and used exclusively by the dev-server middleware proxies in `vite.config.ts`. They are never injected into the client bundle.

<!-- VERIFY: Vite's env handling strips non-VITE_ vars from client bundle by default -->

---

## Deployment

### `vercel.json`

Configuration for Vercel deployment:

- **Rewrites:** All routes (`/(.*)`) redirect to `/index.html` — standard SPA routing
- **Security headers:**
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### `api/` directory (Vercel Serverless Functions)

- `api/ai/generate.ts` — AI generation endpoint (Vercel Function)
- `api/search/index.ts` — Search endpoint (Vercel Function)

These are deployed as Vercel Serverless Functions when the project is deployed to Vercel. During development, equivalent handlers run as Vite dev middleware.

<!-- VERIFY: Vercel deployment requires the project to be linked to a Vercel account and configured via `vercel.json` -->

---

## PWA

Configured via `vite-plugin-pwa` in `vite.config.ts`:

| Setting | Value |
|---------|-------|
| Registration | `autoUpdate` |
| Pre-cached assets | favicon.ico, apple-touch-icon.png, maskable-icon.png |
| Theme color | `#09090b` (dark) |
| Display | `standalone` |
| Workbox glob patterns | `**/*.{js,css,html,ico,png,svg,woff2}` |
| Runtime caching | Google Fonts (CacheFirst, 1 year expiry), API routes (NetworkOnly) |

<!-- VERIFY: PWA requires a valid HTTPS deployment for ServiceWorker registration -->
