# Development

Guidelines for developing and contributing to the IdeaScape codebase.

---

## Development Workflow

### 1. Start the Dev Server

```bash
npm run dev
```

This runs the Vite dev server at `http://localhost:5173` with HMR. The dev server also starts two middleware proxies:
- `/api/ai/generate` — AI generation proxy
- `/api/search` — Web search proxy

### 2. Make Changes

The project uses hot module replacement — edit any file under `src/` and see changes instantly in the browser (no full reload needed for most changes).

### 3. Run Tests

```bash
npm test
```

Tests run via Vitest in a jsdom environment. See [TESTING.md](TESTING.md) for details.

### 4. Build for Production

```bash
npm run build
```

Output goes to `dist/`. The build is code-split into vendor chunks by category (UI, charts, export) for caching efficiency.

---

## Code Architecture

### Layers

```
src/
├── main.tsx               # Entry point — mounts React app
├── styles/                # Global CSS, themes
└── app/
    ├── App.tsx            # Shell layout — canvas, toolbars, overlays
    ├── store/             # Zustand canvas store (nodes, connections, history)
    ├── stores/            # Zustand feature stores (AI, collaboration)
    ├── components/        # UI components organized by feature
    ├── services/          # Business logic (AI, browser sessions, canvas tools)
    └── utils/             # Utilities (Supabase client, content formatting)
api/                       # Vercel Serverless Functions
src/server/                # Dev-server middleware (AI proxy, search proxy)
```

### State Management

IdeaScape uses **Zustand** with multiple stores:

| Store | File | Responsibility |
|-------|------|----------------|
| Canvas Store | `src/app/store/canvasStore.ts` | Nodes, connections, groups, undo/redo history |
| AI Slice | `src/stores/slices/aiSlice.ts` | AI suggestions, group naming, summarization |
| Collaboration Store | `src/stores/collaborationStore.ts` | Supabase Realtime presence, cursor sync, sharing |

Stores are independent and can be subscribed to from any component via `useStore()` hooks.

### Component Patterns

- **Feature components** live in `src/app/components/` (e.g., `InfiniteCanvas.tsx`, `CanvasNode.tsx`)
- **UI primitives** (~40+) live in `src/app/components/ui/` (Radix/shadcn pattern)
- Components use Tailwind CSS 4 utility classes for styling
- Motion (Framer Motion) is used for animations and transitions

---

## Coding Standards

### TypeScript

- Strict mode enabled (via Vite defaults)
- `@typescript-eslint/no-unused-vars`: warn (prefix unused params with `_`)
- `@typescript-eslint/no-explicit-any`: warn (avoid `any`, prefer `unknown`)
- Prefer explicit types over inference for public APIs

### Imports

- Use the `@/` alias for imports from `src/`:
  ```typescript
  import { CanvasNode } from '@/app/components/CanvasNode'
  import { useCanvasStore } from '@/app/store/canvasStore'
  ```
- Relative imports work but prefer `@/` for clarity

### Styling

- Use Tailwind CSS 4 utility classes (`@tailwindcss/vite` plugin handles processing)
- CSS variables and theme values in `src/styles/globals.css` and `src/styles/default_theme.css`
- Follow the project's design language (see [DESIGN.md](/DESIGN.md) at project root)

---

## Dev Server Architecture

The Vite dev server runs two middleware proxies:

### AI Proxy (`/api/ai/generate`)

- Handler: `src/server/aiProxy.ts`
- Receives AI generation requests from the client
- Forwards them to **NVIDIA NIM** (exclusive provider in this build)
- API key (`NVIDIA_API_KEY`) stays server-side — never sent to the browser
- Supports streaming responses

### Search Proxy (`/api/search`)

- Handler: `src/server/searchProxy.ts`
- Provides web search via DuckDuckGo Instant Answer API (free, no key required)
- Returns structured results with titles, URLs, snippets, and optional instant answers

---

## Adding Features

1. **New component:** Create in `src/app/components/`, follow naming convention (PascalCase `.tsx`)
2. **New store slice:** Add to existing stores or create a new store file
3. **New API route:** Add to `api/` directory for Vercel deployment, or add Vite middleware in `vite.config.ts`
4. **New service:** Create in `src/app/services/`

---

## Testing During Development

- Run `npm test` frequently to catch regressions
- Write tests alongside new features (see [TESTING.md](TESTING.md))
- Tests use Vitest + jsdom — no browser needed
