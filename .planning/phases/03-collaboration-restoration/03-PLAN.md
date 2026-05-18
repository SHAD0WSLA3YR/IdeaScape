---
phase: 03-collaboration-restoration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/config.toml
  - supabase/migrations/001_collaboration_tables.sql
  - supabase/functions/make-server-832115ea/index.ts
  - supabase/functions/make-server-832115ea/deno.json
  - src/app/stores/collaborationStore.ts
  - src/app/components/CollaborationPanel.tsx
  - src/app/components/CollaborationStatus.tsx
  - src/app/components/Toolbar.tsx
  - .env.example
  - .env.local
autonomous: false
requirements:
  - COLLAB-01
  - COLLAB-02
  - COLLAB-03
must_haves:
  truths:
    - "User can create a collaborative canvas via the UI and get a working share URL"
    - "User can join a canvas by visiting a ?canvas= URL"
    - "User sees other participants' names and cursor positions in real-time"
    - "Canvas state changes sync between participants within 2 seconds"
    - "The CollaborationPanel shows real data, not demo mode placeholders"
    - "Supabase CLI workflow is documented so backend can be re-deployed"
  artifacts:
    - path: supabase/functions/make-server-832115ea/index.ts
      provides: "Edge Function with all 5 REST endpoints"
      contains: "Deno.serve"
      min_count: 1
    - path: supabase/functions/make-server-832115ea/deno.json
      provides: "Deno configuration for function runtime"
      contains: "supabase-js"
      min_count: 1
    - path: supabase/migrations/001_collaboration_tables.sql
      provides: "Database tables for canvases and participants"
      contains: "CREATE TABLE collaborative_canvases"
      min_count: 1
    - path: src/app/components/CollaborationPanel.tsx
      provides: "Live collaboration dialog with real API calls"
      contains: "handleCreateCanvas"
      min_count: 1
    - path: .env.example
      provides: "Documented env var VITE_ENABLE_COLLABORATION"
      contains: "VITE_ENABLE_COLLABORATION"
      min_count: 1
  key_links:
    - from: supabase/functions/make-server-832115ea/index.ts
      to: "src/app/stores/collaborationStore.ts"
      via: "fetch to API_BASE + endpoint paths"
      pattern: "make-server-832115ea"
    - from: src/app/components/CollaborationPanel.tsx
      to: "src/app/stores/collaborationStore.ts"
      via: "useCollaborationStore hook"
      pattern: "useCollaborationStore"
    - from: .env.local
      to: "src/app/components/Toolbar.tsx"
      via: "import.meta.env.VITE_ENABLE_COLLABORATION"
      pattern: "VITE_ENABLE_COLLABORATION"
---

<objective>
Restore the real-time collaboration feature to a working state end-to-end.

**Waves:**

Wave 1 — Backend (Plan A: the agent creates code, but user deploys):
- Supabase project config + database migration tables
- Edge Function `make-server-832115ea` with 5 REST endpoints
- Deploy to production

Wave 2 — Frontend (fully autonomous after backend is live):
- Remove "Demo Mode" from CollaborationPanel.tsx
- Remove "Coming Soon" badge
- Wire real store methods
- Document VITE_ENABLE_COLLABORATION

**Output:**
- `supabase/config.toml` — Project config linked to project `dlcrpzzwjgoakkvgjlhq`
- `supabase/migrations/001_collaboration_tables.sql` — `collaborative_canvases` + `canvas_participants`
- `supabase/functions/make-server-832115ea/index.ts` — Edge Function with 5 endpoints
- `supabase/functions/make-server-832115ea/deno.json` — Deno runtime config
- `src/app/components/CollaborationPanel.tsx` — Live mode (no demos)
- `.env.example` + `.env.local` — With VITE_ENABLE_COLLABORATION=true
</objective>

<execution_context>
@C:/Users/abdul/.config/opencode/get-shit-done/workflows/execute-plan.md
@C:/Users/abdul/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-collaboration-restoration/03-CONTEXT.md
@src/app/stores/collaborationStore.ts
@src/app/components/CollaborationPanel.tsx
@src/app/components/CollaborationStatus.tsx
@src/app/components/UserCursors.tsx
@src/app/components/Toolbar.tsx
@src/app/App.tsx
@src/app/utils/supabase/info.tsx
@.env.example
</context>

<interfaces>
**Key types from collaborationStore.ts:**

```typescript
interface UserPresence {
  userId: string;
  userName: string;
  cursor?: { x: number; y: number };
  lastSeen: string;
  color: string;
}

interface CollaborativeCanvas {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  participants: string[];
  maxParticipants: number;
}

// Store actions consumed by UI:
createCollaborativeCanvas(name, data) => Promise<{ success, canvasId?, shareUrl?, error? }>
joinCanvas(canvasId, userName?) => Promise<{ success, error? }>
leaveCanvas() => Promise<void>
updateCanvasData(data) => Promise<{ success, error? }>
updatePresence(presence) => Promise<void>
subscribeToCanvas(canvasId) => void
unsubscribeFromCanvas() => void
getShareableUrl(canvasId) => string
getOtherParticipants() => UserPresence[]
getCurrentUser() => UserPresence | null
```

**Existing store state selectors used in CollaborationPanel:**
```typescript
isConnected, isCollaborating, currentCanvasId, participants,
createCollaborativeCanvas, joinCanvas, leaveCanvas,
getShareableUrl, getOtherParticipants, getCurrentUser
```

**Edge Function API Base:**
```typescript
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-832115ea`;
// projectId = "dlcrpzzwjgoakkvgjlhq"
```

**Env var gate (Toolbar.tsx line 23):**
```typescript
const collaborationEnabled = (import.meta as any)?.env?.VITE_ENABLE_COLLABORATION === 'true';
```
</interfaces>

---

## Wave 1 — Backend: Edge Function + Database

Wave objective: Create and deploy the Supabase backend that the frontend store already expects to talk to.

---

### Task A1: Create Supabase project config and database migration

**Type:** auto
**Files:** `supabase/config.toml`, `supabase/migrations/001_collaboration_tables.sql`

**Read first:**
- `src/app/stores/collaborationStore.ts` (types for `CollaborativeCanvas` lines 19-27, `UserPresence` lines 11-17)
- `src/app/utils/supabase/info.tsx` (projectId)

**Action:**

Create `supabase/` directory structure with `supabase init` or manually:

**Part A — `supabase/config.toml`:**

```toml
[project]
project_id = "ideascape"

[api]
enabled = true
port = 54321
schemas = ["public"]

[auth]
enabled = false

[edge_functions]
enabled = true

[analytics]
enabled = false
```

**Part B — `supabase/migrations/001_collaboration_tables.sql`:**

Write this migration:

```sql
-- Create collaborative canvases table
CREATE TABLE IF NOT EXISTS collaborative_canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  max_participants INTEGER DEFAULT 2 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create canvas participants table
CREATE TABLE IF NOT EXISTS canvas_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES collaborative_canvases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'commenter')),
  last_seen TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  cursor_pos JSONB DEFAULT NULL,
  UNIQUE(canvas_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_participants_canvas_id ON canvas_participants(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_participants_user_id ON canvas_participants(user_id);
```

Column explanations matching the store contracts (per D-02, D-05):
- `data JSONB` — full canvas state (nodes, connections, groups) stored as a JSON blob, matching the `CollaborativeCanvas.data: any` type
- `max_participants` — hard limit matching store's `maxParticipants`. Default 2 as shown in CollaborationPanel UI
- `cursor_pos` — stores the `{x, y}` cursor from `UserPresence.cursor`
- `UNIQUE(canvas_id, user_id)` — prevents duplicate participant entries on rejoin

**Verify:**

```powershell
Test-Path "supabase/config.toml" -and (Select-String -Path "supabase/migrations/001_collaboration_tables.sql" -Pattern "CREATE TABLE collaborative_canvases").Count -gt 0
```

**Acceptance criteria:**
- `supabase/config.toml` exists with `[project]` and `project_id`
- Migration contains `CREATE TABLE collaborative_canvases` with all 6 columns
- Migration contains `CREATE TABLE canvas_participants` with UNIQUE constraint
- Both indexes exist

**Done:** Database schema ready for deployment.

**Commit strategy:** `git add supabase/config.toml supabase/migrations/001_collaboration_tables.sql && git commit -m "feat(03): add collaboration database schema"`

---

### Task A2: Create Edge Function — make-server-832115ea

**Type:** auto (tdd=true)
**Files:** `supabase/functions/make-server-832115ea/index.ts`, `supabase/functions/make-server-832115ea/deno.json`

**Read first:**
- `src/app/stores/collaborationStore.ts` (full store — every endpoint URL and response destructure)
- `src/app/utils/supabase/info.tsx` (project ID `dlcrpzzwjgoakkvgjlhq` and anon key)

**Behavior:**
The Edge Function must respond to these 5 endpoints with response shapes that match exactly what `collaborationStore.ts` destructures:

| Endpoint | Method | Store call location | Response shape expected |
|----------|--------|-------------------|----------------------|
| /canvas/create | POST | line 120-131 | `{ success, canvasId, shareUrl }` |
| /canvas/:id/join | POST | line 192-202 | `{ success, canvas: { id, name, data, createdAt, updatedAt, participants[], maxParticipants }, role }` |
| /canvas/:id/leave | POST | line 275-282 | 200 empty or `{}` |
| /canvas/:id | PUT | line 312-321 | `{ success }` |
| /canvas/:id/presence | PUT | line 346-356 | 200 empty or `{}` |
| /health | GET | Debug only | `{ status: "ok" }` |

**Action:**

**Part A — `supabase/functions/make-server-832115ea/deno.json`:**

```json
{
  "tasks": {
    "serve": "supabase functions serve make-server-832115ea"
  },
  "imports": {
    "supabase-js": "npm:@supabase/supabase-js@2"
  },
  "compilerOptions": {
    "allowJs": true,
    "lib": ["deno.window"]
  }
}
```

**Part B — `supabase/functions/make-server-832115ea/index.ts`:**

The function must:
1. Handle CORS preflight (`OPTIONS` requests)
2. Parse the request URL path to route to the correct endpoint handler
3. For each endpoint, use `supabase-js` to query the database
4. After data mutations (`PUT /canvas/:id`, `PUT /canvas/:id/presence`), broadcast to the Realtime channel so connected clients get the update
5. Return exact response shapes the store expects

Write the full function. Key implementation rules:

- Use URLPattern or manual path parsing (not Express-style routing — Deno has no Express)
- Include `corsHeaders` on **every** response
- All error paths return `{ success: false, error: string }` with status 400 or 500
- Use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` for authenticated DB access since the function runs server-side (per D-04)
- Broadcast via `supabase.channel(\`canvas:${canvasId}\`).send({ type: 'broadcast', event: '...', payload: {...} })` — do NOT subscribe, only send broadcasts (the frontend store already subscribes to `canvas:${canvasId}`)
- After `POST /canvas/:id/join`, pull all participants for that canvas and include in the response `canvas.participants` array
- Participant limit check: before allowing join, count existing participants against `collaborative_canvases.max_participants`
- Creator auto-joins: After `POST /canvas/create`, insert the creator as the first `canvas_participants` entry

Full implementation pattern (from Supabase docs reference):

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);

    // Route handling...
    // (Implement all 5 endpoints as described above)

    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
```

**Verify:**

```bash
# Local test after deploying:
curl -X POST http://localhost:54321/functions/v1/make-server-832115ea/canvas/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"name":"test","userId":"test-user","data":{}}'
# Expected: {"success":true,"canvasId":"<uuid>","shareUrl":"http://..."}
```

**Acceptance criteria:**
- `index.ts` contains `Deno.serve` and handles all 5 endpoints
- All responses include CORS headers
- `POST /canvas/create` inserts into `collaborative_canvases` AND `canvas_participants`
- `POST /canvas/:id/join` checks participant count against max_participants
- `PUT /canvas/:id` broadcasts `canvas_update` to Realtime channel
- `PUT /canvas/:id/presence` broadcasts `presence_update` to Realtime channel
- All error paths use `{ success: false, error: string }`

**Done:** Edge Function written with correct API contracts. Ready for deployment.

**Commit strategy:** `git add supabase/functions/ && git commit -m "feat(03): create collaboration Edge Function with 5 endpoints"`

---

### Task A3: Deploy backend — migration + Edge Function

**Type:** checkpoint:human-verify
**Gate:** blocking

**What built:**
- Database migration applied to Supabase project `dlcrpzzwjgoakkvgjlhq`
- Edge function `make-server-832115ea` deployed to Supabase

**Action:**

Step-by-step deployment:

1. **Install Supabase CLI** (one-time):
```powershell
npm install -g supabase
```

2. **Authenticate and link to project:**
```powershell
# Login (opens browser for token)
supabase login

# Link to existing project
supabase link --project-ref dlcrpzzwjgoakkvgjlhq
```

3. **Apply database migration:**
```powershell
supabase migration up
```

4. **Deploy Edge Function** (no JWT verification — the store uses anon key):
```powershell
supabase functions deploy make-server-832115ea --no-verify-jwt
```

5. **Set required secrets:**
```powershell
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<paste-your-service-role-key>
```

The `SUPABASE_SERVICE_ROLE_KEY` is available from:
Supabase Dashboard → Project Settings → API → `service_role key` (NOT the anon key)

**How to verify:**
```powershell
# Test health endpoint
curl -X GET "https://dlcrpzzwjgoakkvgjlhq.supabase.co/functions/v1/make-server-832115ea/health" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsY3Jwenp3amdvYWtrdmdqbGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTg1MjMsImV4cCI6MjA3MjE5NDUyM30.h15MzDjDDGEzCWjBFHmgNBtsFX0uhQOb25NOm-qjOz0"

# Test canvas creation
curl -X POST "https://dlcrpzzwjgoakkvgjlhq.supabase.co/functions/v1/make-server-832115ea/canvas/create" -H "Content-Type: application/json" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsY3Jwenp3amdvYWtrdmdqbGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTg1MjMsImV4cCI6MjA3MjE5NDUyM30.h15MzDjDDGEzCWjBFHmgNBtsFX0uhQOb25NOm-qjOz0" -d '{"name":"Deploy Test","userId":"deployer","data":{"nodes":[],"connections":[]}}'
# Expected: {"success":true,"canvasId":"<uuid>","shareUrl":"..."}
```

**Resume signal:** Type "approved" or describe any issues encountered.

---

## Wave 2 — Frontend: Remove Demo Mode, Wire Store, Enable Flag

Wave objective: Remove all demo/preview code from the CollaborationPanel, connect it to the real store, add the env var, and make the end-to-end workflow functional. This wave runs AFTER backend deployment is verified.

---

### Task B1: Wire CollaborationPanel to real store methods, remove demo mode

**Type:** auto
**Files:** `src/app/components/CollaborationPanel.tsx`

**Read first:**
- `src/app/components/CollaborationPanel.tsx` (current full file — need to understand the demo code to replace it)
- `src/app/stores/collaborationStore.ts` (method signatures and return types for `createCollaborativeCanvas`, `joinCanvas`, `getShareableUrl`, etc.)

**Action:**

Replace the demo-mode `handleCreateCanvas` with a real call to the store. Remove all demo/preview/"Coming Soon" code.

**Changes needed:**

**Part A — Remove "Coming Soon" badge (line 109-111):**
Delete the `<Badge>` element that says "Coming Soon":
```tsx
{/* Delete this entire block: */}
<Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
  Coming Soon
</Badge>
```

**Part B — Replace demo-mode `handleCreateCanvas` (lines 40-66):**
Replace the current `handleCreateCanvas` that simulates a 2-second delay with a real call:
```typescript
const handleCreateCanvas = async () => {
  if (!canvasName.trim()) {
    toast.error('Please enter a canvas name');
    return;
  }

  setIsCreating(true);

  try {
    const result = await createCollaborativeCanvas(canvasName.trim(), canvasData ?? { nodes: [], connections: [], groups: [] });

    if (result.success && result.shareUrl) {
      setShareUrl(result.shareUrl);
      toast.success('Collaborative canvas created!', {
        description: 'Share the URL to invite others.',
        duration: 5000
      });
    } else {
      toast.error(result.error || 'Failed to create collaborative canvas');
    }
  } catch (error) {
    console.error('Error creating canvas:', error);
    toast.error('Failed to create canvas. Please try again.');
  } finally {
    setIsCreating(false);
  }
};
```

**Part C — Fix the share URL input (around line 197):**
The input currently uses a hardcoded demo URL string. Replace with the actual `shareUrl` state:
```tsx
<Input
  id="share-url-input"
  value={shareUrl}
  readOnly
  className="text-xs select-all font-mono"
  placeholder="Share URL will appear here after creation..."
  onClick={(e) => (e.target as HTMLInputElement).select()}
/>
```

**Part D — Remove demo mode notice (around lines 206-210):**
Delete the "Demo Mode" notice:
```tsx
{/* Delete this entire block: */}
{isCollaborating && (
  <div className="text-xs text-muted-foreground">
    🎭 Demo Mode: This is a preview URL for demonstration purposes
  </div>
)}
```

**Part E — Update DialogDescription (lines 113-118):**
Replace "Coming Soon" language with functional description:
```tsx
<DialogDescription>
  {isCollaborating
    ? 'Share the URL below to invite others to collaborate in real-time.'
    : 'Create a shareable canvas for real-time collaboration with up to 2 people.'
  }
</DialogDescription>
```

**Part F — Remove the empty line gap (line 67 — delete the extra blank line between handlers):**
Just clean up.

**Verify:**

```powershell
# No demo mode strings remain
(Select-String -Path "src/app/components/CollaborationPanel.tsx" -Pattern "Demo|demo|Coming Soon").Count -eq 0

# Real store methods are called
(Select-String -Path "src/app/components/CollaborationPanel.tsx" -Pattern "createCollaborativeCanvas|joinCanvas").Count -ge 1

# LSP diagnostics clean
npx tsc --noEmit --pretty 2>&1 | Select-String "error"
```

**Acceptance criteria:**
- No string `"Demo"`, `"demo"`, or `"Coming Soon"` exists in CollaborationPanel.tsx
- `handleCreateCanvas` calls `createCollaborativeCanvas` instead of `setTimeout`
- Share URL input reads from `shareUrl` state variable, not hardcoded string
- No "Demo Mode" notice rendered
- Dialog description does not mention "Coming Soon"
- `npm run build` succeeds
- `lsp_diagnostics` clean on CollaborationPanel.tsx

**Done:** CollaborationPanel is in live mode — calls real APIs, shows real share URLs, no preview/demo code.

**Commit strategy:** `git add src/app/components/CollaborationPanel.tsx && git commit -m "feat(03): wire CollaborationPanel to real store methods, remove demo mode"`

---

### Task B2: Add VITE_ENABLE_COLLABORATION env var to .env files

**Type:** auto
**Files:** `.env.example`, `.env.local`

**Read first:**
- `src/app/components/Toolbar.tsx` (line 23 — the `import.meta.env.VITE_ENABLE_COLLABORATION` gate)
- `.env.example` (current content)
- `.env.local` (current content — must not overwrite existing keys)

**Action:**

**Part A — Append to `.env.example`:**
```env

# ============================================================
# Collaboration Feature
# ============================================================
# Set to "true" to enable real-time collaboration via Supabase Realtime.
# Requires deployed Edge Functions and linked Supabase project.
VITE_ENABLE_COLLABORATION=true
```
Vite exposes `VITE_` prefixed env vars to client code. This is a **build-time toggle** — the feature is bundled only when enabled. Per D-07.

**Part B — Append to `.env.local`:**
Read the current `.env.local` first, then append the same block at the end (do NOT overwrite existing NVIDIA and OpenRouter keys):
```env
# ============================================================
# Collaboration Feature
# ============================================================
VITE_ENABLE_COLLABORATION=true
```

**Verify:**

```powershell
# Both files contain the env var
(Select-String -Path ".env.example" -Pattern "VITE_ENABLE_COLLABORATION").Count -eq 1
(Select-String -Path ".env.local" -Pattern "VITE_ENABLE_COLLABORATION").Count -eq 1

# Existing keys are preserved (check NVIDIA key still in .env.local)
(Select-String -Path ".env.local" -Pattern "NVIDIA_API_KEY").Count -eq 1
```

**Acceptance criteria:**
- `.env.example` contains `VITE_ENABLE_COLLABORATION=true` with section header comment
- `.env.local` contains `VITE_ENABLE_COLLABORATION=true`
- `.env.local` still has `NVIDIA_API_KEY` and all other existing keys
- Build succeeds: `npm run build`

**Done:** Collaboration feature is enabled via documented env var.

**Commit strategy:** `git add .env.example .env.local && git commit -m "feat(03): add VITE_ENABLE_COLLABORATION env var"`

---

### Task B3: Verify the collaboration feature end-to-end

**Type:** checkpoint:human-verify
**Gate:** blocking
**Files:** `src/app/components/CollaborationPanel.tsx`, `src/app/components/Toolbar.tsx`

**What built:**
- Full end-to-end collaboration flow: create canvas → share URL → join as second user → see cursors → see state sync

**How to verify:**

1. **Start the dev server:**
```powershell
npm run dev
```

2. **Open the app** at `http://localhost:5173`

3. **Verify the collaboration button works:**
   - Click the Users icon (toolbar, right side)
   - The CollaborationPanel dialog should open WITHOUT a "Coming Soon" badge
   - The "Create Collaborative Canvas" button should NOT show "Demo Mode"

4. **Create a collaborative canvas:**
   - Enter a canvas name
   - Click "Create Collaborative Canvas"
   - Verify: success toast, share URL appears in the input field

5. **Open a second browser tab/window:**
   - Paste the share URL with `?canvas=<id>` parameter
   - OR: Run the same app at `http://localhost:5173` and use the join flow
   - Verify: second user appears in participants list of the first tab

6. **Verify real-time cursors:**
   - With both tabs open, move the mouse in each
   - Verify: cursor from tab B appears in tab A (as colored arrow + name label)

7. **Verify canvas state sync:**
   - In tab A, create a node
   - Verify: node appears in tab B within 2 seconds

8. **Verify CollaborationStatus indicator:**
   - The top-center status bar shows: connected status, participant count, canvas ID

**Resume signal:** Type "approved" or describe any issues encountered.

---

## End-to-End Verification

After both waves complete:

| Check | How | Expected |
|-------|-----|----------|
| Build | `npm run build` | Success, no ts errors |
| Tests | `npm test` | All existing tests pass |
| CollaborationPanel | Open dialog via toolbar | No "Coming Soon" badge, no "Demo" text |
| Canvas create | Click create button | shareUrl appears, success toast |
| Join via URL | Open `?canvas=<id>` in new tab | Shows participants, sync works |
| Cursor sync | Move mouse in two tabs | Remote cursors visible |
| State sync | Create node in tab A | Appears in tab B within ~2s |
| Status bar | Status indicator | Shows connected, participant count |
| Env var | Check `.env.local` | `VITE_ENABLE_COLLABORATION=true` |

---

## Threat Model

| Threat | Category | Disposition | Mitigation |
|--------|----------|-------------|------------|
| Unauthenticated canvas creation | Spoofing | Accept | Anonymous collaboration by design. No PII/billing data |
| Canvas data overwrite by bad actor | Tampering | Accept | Any participant can overwrite canvas. User-generated content only |
| CORS wildcard exposes endpoint | Information Disclosure | Accept | Edge Function URL already public. Restrict origin later if needed |
| No rate limiting on canvas create | DoS | Accept | Low-risk for private usage. Add rate limiting if scaled |

## Rollback

If the deployment breaks or the frontend has issues:

```powershell
# Rollback Edge Function: deploy a previous version via CLI
supabase functions deploy make-server-832115ea --no-verify-jwt

# Rollback frontend changes:
git checkout -- src/app/components/CollaborationPanel.tsx
git checkout -- .env.local
git checkout -- .env.example
```

## Commit Strategy

| # | Commit | Files |
|---|--------|-------|
| 1 | `feat(03): add collaboration database schema` | `supabase/config.toml`, `supabase/migrations/001_collaboration_tables.sql` |
| 2 | `feat(03): create collaboration Edge Function with 5 endpoints` | `supabase/functions/make-server-832115ea/index.ts`, `supabase/functions/make-server-832115ea/deno.json` |
| 3 | `feat(03): wire CollaborationPanel to real store methods, remove demo mode` | `src/app/components/CollaborationPanel.tsx` |
| 4 | `feat(03): add VITE_ENABLE_COLLABORATION env var` | `.env.example`, `.env.local` |

Each commit is atomic — independently testable. If any commit causes build errors, it can be reverted without affecting the others.

<output>
After completion, create `.planning/phases/03-collaboration-restoration/03-SUMMARY.md`
</output>
