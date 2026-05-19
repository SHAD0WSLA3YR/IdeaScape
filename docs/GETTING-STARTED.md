# Getting Started

This guide covers local setup, configuration, and first run of the IdeaScape development environment.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (ships with Node.js) or **pnpm**
- A code editor (VS Code recommended)
- **Optional:** Git CLI for version control

### API Keys (Required)

IdeaScape requires at least one AI provider API key:

| Provider | Required? | Cost | Get Key |
|----------|-----------|------|---------|
| NVIDIA NIM | Yes (primary) | Free tier available | [build.nvidia.com](https://build.nvidia.com) |
| OpenRouter | No (legacy) | Free tier available | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Supabase | No (collaboration only) | Free tier | [supabase.com](https://supabase.com) |

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd Infinitecanvaswebapp
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
NVIDIA_API_KEY=nvapi-your-real-key-here
```

### 3. Start Dev Server

```bash
npm run dev
```

The app starts at **http://localhost:5173** with hot module replacement.

### 4. Verify It Works

- The infinite canvas loads with a welcome card
- AI suggestions panel appears on the right
- Toolbar is visible at the top with export, undo/redo, and collaboration options
- Open DevTools console — no errors expected

---

## Project Structure

```
Infinitecanvaswebapp/
├── api/                  # Vercel Serverless Functions
│   ├── ai/generate.ts    # AI generation endpoint
│   └── search/index.ts   # Web search endpoint
├── public/               # Static assets (icons, favicon)
├── src/
│   ├── main.tsx          # React entry point
│   ├── styles/           # Global CSS (Tailwind + themes)
│   └── app/
│       ├── App.tsx       # Root shell component
│       ├── store/        # Zustand canvas store
│       ├── stores/       # AI & collaboration stores
│       ├── components/   # UI components (~40+ primitives)
│       ├── services/     # AI, browser session, canvas tools
│       └── utils/        # Supabase client config
├── docs/                 # Project documentation
├── vite.config.ts        # Vite build configuration
├── vitest.config.ts      # Test runner configuration
└── vercel.json           # Vercel deployment settings
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Vite HMR at port 5173) |
| `npm run build` | Production build with code splitting and PWA |
| `npm test` | Run Vitest smoke tests in jsdom environment |

---

## Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for component hierarchy and data flow
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for coding guidelines and workflows
- Read [API.md](API.md) for available API endpoints and integration details
- Read [CONFIGURATION.md](CONFIGURATION.md) for all config file documentation
- Read [TESTING.md](TESTING.md) for test patterns and coverage guidelines

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| Blank page on `localhost:5173` | Missing or invalid API key | Check `.env.local` exists and has valid `NVIDIA_API_KEY` |
| AI suggestions not appearing | Network or API key issue | Open browser DevTools Network tab, check `/api/ai/generate` responses |
| Collaboration not working | Supabase not configured | Collaboration is optional — workspace loads without it |
| `npm install` errors | Node.js version mismatch | Verify Node.js 18+ with `node --version` |
