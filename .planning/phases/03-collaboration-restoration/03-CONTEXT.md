# Phase 3: Collaboration Restoration — Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Source:** Codebase audit + Supabase Edge Functions research

<domain>
## Phase Boundary

Restore the real-time collaboration feature to a working state end-to-end. The collaboration store (`collaborationStore.ts`), UI components (`CollaborationPanel`, `CollaborationStatus`, `UserCursors`), and App.tsx wiring all exist but are not functional because:

1. **No Supabase Edge Function deployed** — The store calls `https://{projectId}.supabase.co/functions/v1/make-server-832115ea/*` endpoints that don't exist
2. **No database tables** — No `collaborative_canvases` or `canvas_participants` tables in Supabase
3. **CollaborationPanel is in "Demo Mode"** — `handleCreateCanvas` fakes a 2-second delay and shows a preview URL instead of actually calling the store
4. **"Coming Soon" badge** — UI labels the feature as "Coming Soon"
5. **VITE_ENABLE_COLLABORATION env var** — Feature is gated behind this env var but it's not documented in `.env.example` or set in `.env.local`

Scope spans:
- **Backend:** Supabase Edge Function creation + deployment, database tables, Realtime channel configuration
- **Frontend:** Remove demo mode and "Coming Soon" badge, wire CollaborationPanel to real store methods, document env var
</domain>

<decisions>
## Implementation Decisions

### Edge Function Architecture (D-01)
- **Locked:** Single Edge Function `make-server-832115ea` with path-based URLPattern routing (one Deno.serve handler dispatching to 5 endpoint handlers)
- **Reason:** The existing collaborationStore already targets this function name with path-based endpoints (`/canvas/create`, `/canvas/:id/join`, etc.). Changing the function name would require modifying 5+ fetch URLs in collaborationStore.ts. A single function with URLPattern routing matches the existing store contract exactly.
- **Reference:** collaborationStore.ts:69 - `const API_BASE = \`https://\${projectId}.supabase.co/functions/v1/make-server-832115ea\``

### Database Tables (D-02)
- **Locked:** Two tables via Supabase migration:
  1. `collaborative_canvases` — stores canvas metadata and full data snapshot (JSONB)
  2. `canvas_participants` — tracks active participants per canvas with presence info
- **Reason:** The store's `createCollaborativeCanvas` writes JSON data snapshots, `joinCanvas` reads canvas metadata + participants. Two tables with a foreign key relationship model this cleanly and support RLS policies for access control.

### Realtime Channel Pattern (D-03)
- **Locked:** Use Supabase Realtime broadcast channels (not presence) for canvas sync and cursor tracking. The store already implements this pattern with `channel.on('broadcast', { event: '...' })` handlers.
- **Reason:** The store's `subscribeToCanvas` already uses broadcast events (`canvas_update`, `presence_update`, `user_left`, `node_focus`, `node_blur`). The edge function will broadcast these events to the channel after processing mutations, rather than relying on Postgres replication which has higher latency.
- **Reference:** collaborationStore.ts:363-445

### Authentication Strategy (D-04)
- **Locked:** Use public anon key with user-generated IDs (no Supabase Auth). The store generates user IDs via `generateUserId()` and stores in localStorage.
- **Reason:** The existing store already uses this pattern — no auth dependency, lightweight onboarding, anonymous collaboration. Edge Functions will receive the anon key for auth but trust user-generated IDs (stored in localStorage).
- **Reference:** collaborationStore.ts:86-93, collaborationStore.ts:124

### API Response Contract (D-05)
- **Locked:** Server responses must match the exact response shapes expected by collaborationStore.ts. The store destructures `result.success`, `result.canvasId`, `result.shareUrl`, `result.canvas`, `result.role`, `result.error` etc. from the edge function responses.
- **Reason:** The store's error handling checks `result.success` and `result.error` patterns consistently. Changing the response format would break error handling across 5+ methods.
- **Reference:** collaborationStore.ts:147-157, collaborationStore.ts:218-227

### Deployment Flow (D-06)
- **Locked:** Deploy Edge Function via `supabase functions deploy make-server-832115ea --no-verify-jwt`. Supabase CLI must be installed (`npm install -g supabase` on Windows).
- **Reason:** The Supabase dashboard can deploy functions but the CLI is required for local development, testing, and version control of function code. `--no-verify-jwt` is required because the store uses the public anon key, not authenticated JWTs.

### VITE_ENABLE_COLLABORATION (D-07)
- **Locked:** Set `VITE_ENABLE_COLLABORATION=true` in `.env.local` and document in `.env.example`. The Toolbar button and CollaborationPanel rendering are gated behind this flag.
- **Reason:** The existing code in Toolbar.tsx:23 already reads `import.meta.env.VITE_ENABLE_COLLABORATION`. The flag provides a safety switch to disable the feature without code changes.
- **Reference:** Toolbar.tsx:23, Toolbar.tsx:746-751

### the agent's Discretion
- Exact Deno import versions in the Edge Function (use `npm:supabase-js@2`) — keep them on the latest stable
- Whether to implement cursor broadcast via Edge Function or direct Realtime channel broadcast from the client — the store already sends presence data via PUT endpoint which the Edge Function can then broadcast
- Error message wording in the CollaborationPanel UI
- Whether to add loading skeletons during canvas creation

</decisions>

<canonical_refs>
## Canonical References

### Store Contract (READ FIRST before defining Edge Function API)
- `src/app/stores/collaborationStore.ts` — Full Zustand store: all 5 fetch endpoints, Realtime channel setup, presence heartbeat (489 lines)

### UI Components
- `src/app/components/CollaborationPanel.tsx` — Dialog UI, currently in Demo Mode (262 lines)
- `src/app/components/CollaborationStatus.tsx` — Status indicator bar (49 lines)
- `src/app/components/UserCursors.tsx` — Real-time cursor overlay (107 lines)
- `src/app/components/CollaborationDebug.tsx` — Debug panel with server connection tests (111 lines)

### App Integration
- `src/app/App.tsx` — Collaboration wiring: debounced sync, URL joining, CustomEvent listener, beforeunload cleanup (lines 55-61, 212-319, 473-482, 490-494)
- `src/app/components/Toolbar.tsx` — Collaboration button + VITE_ENABLE_COLLABORATION gate (lines 15-16, 23-25, 48, 640-668, 745-752)

### Supabase Config
- `src/app/utils/supabase/info.tsx` — Project ID `dlcrpzzwjgoakkvgjlhq` and public anon key

### Supabase Edge Functions Docs
- `/websites/supabase` — RESTful API patterns with URLPattern routing, Deno.serve, CORS headers, createClient
- Supabase Realtime broadcast channels — `channel.on('broadcast', { event: '...' }, callback)`, `channel.send()`, channel lifecycle
</canonical_refs>

<specifics>
## Specific References

### Endpoint Contract (from collaborationStore.ts):
```
POST /canvas/create          → body: { name, userId, data }
                                 → returns: { success, canvasId, shareUrl }
POST /canvas/:id/join        → body: { userId, userName }
                                 → returns: { success, canvas, role }
POST /canvas/:id/leave       → body: { userId }
                                 → returns: nothing (success check via response.ok)
PUT  /canvas/:id             → body: { data, userId }
                                 → returns: { success }
PUT  /canvas/:id/presence    → body: { userId, presence }
                                 → returns: nothing (error silently logged)
```

### Realtime Broadcast Events (from subscribeToCanvas):
```
canvas:${canvasId} channel broadcasts:
  - canvas_update  → { data, nodes, connections, groups, updatedBy }
  - presence_update → { userId, presence, ... }
  - user_left       → { userId }
  - node_focus      → { userId, nodeId }
  - node_blur       → { userId, nodeId }
```

### Database Schema (from store's type definitions):
```typescript
interface CollaborativeCanvas {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  participants: string[];
  maxParticipants: number;
}

interface UserPresence {
  userId: string;
  userName: string;
  cursor?: { x: number; y: number };
  lastSeen: string;
  color: string;
}
```

### VITE_ENABLE_COLLABORATION toggle
- Toolbar.tsx:23 — `const collaborationEnabled = (import.meta as any)?.env?.VITE_ENABLE_COLLABORATION === 'true';`
- CollaborationPanel is rendered inside `{collaborationEnabled && (...)}`
- Toolbar button's disabled state uses opacity:40 when false
</specifics>

<deferred>
## Deferred Ideas

- **Supabase Auth integration** — Currently using anonymous user IDs with localStorage. Adding Google/GitHub OAuth would improve security but is out of scope.
- **RLS policies** — The Edge Function uses the service role key internally; RLS on tables is unnecessary for this phase since function endpoints control access.
- **Offline collaboration** — OT/CRDT-based conflict resolution for offline edits is a major feature, not a restoration task.
- **Invite links** — Share URL generation via query param already works (`?canvas=`); a full invite system with email is out of scope.
- **Multi-user cursor namespacing** — Cursor colors are currently hardcoded per user; a color assignment strategy is deferred.
</deferred>

---

*Phase: 03-collaboration-restoration*
*Context gathered: 2026-05-18 via codebase audit*
