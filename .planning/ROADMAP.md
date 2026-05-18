# IdeaScape Roadmap

## Milestone: v2.1 Performance & Stability

### Phase 1: Performance Optimization
**Goal:** Eliminate critical full-store re-renders, fix memory leaks, and optimize Zustand subscriptions across the canvas application.

**Requirements:**
- PERF-01: Replace full-store `useCanvasStore()` subscriptions with individual selectors in root and toolbar components
- PERF-02: Clean up stale `setTimeout` closures in event handlers and store actions
- PERF-03: Add React.memo to all list-rendered components with stable callback references
- PERF-04: Fix BrowserNode selector returning new references on every render
- PERF-05: Guard array/object selectors with `useShallow` to prevent mass re-renders
- PERF-06: Extract DOMParser to module-level singleton
- PERF-07: Guard all production console.log with `import.meta.env.DEV`
- PERF-08: Convert module-level anonymous `beforeunload` to named function with cleanup
- PERF-09: Optimize canvas grid background calculations to reduce repaint cost
- PERF-10: Use `useMemo` for connection element trees to avoid re-creation on every render
- PERF-11: Add node-existence guard to store setTimeout callbacks
- PERF-12: Verify listeners exist before dispatching CustomEvent

**Depends on:** None
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Root performance fixes (App.tsx, InfiniteCanvas.tsx)
- [ ] 01-02-PLAN.md — Component optimization (React.memo, Zustand selectors)
- [ ] 01-03-PLAN.md — Service layer & store cleanup (console.log, timers, listeners)

### Phase 2: Floating Chat Persistence
**Goal:** Restore localStorage persistence for floating chat window position and size, which were lost during a git restore that wiped uncommitted changes.

**Discovery:** Graph-to-codebase diff of `graphify-out/graph.json` (858 nodes) revealed `loadFloatingPosition()` and `loadFloatingSize()` functions existed in `canvasStore.ts` but are now absent.

**Depends on:** None
**Plans:** 1 plan

Plans:
- [ ] 02-01-PLAN.md — Restore floating chat persistence (canvasStore.ts + EnhancedChatDialog.tsx)

### Phase 3: Collaboration Restoration
**Goal:** Restore real-time collaboration feature end-to-end — from Supabase backend (Edge Functions + database tables) to frontend (remove demo mode, wire store, enable feature flag).

**Requirements:**
- COLLAB-01: Deploy Supabase Edge Function and database tables for collaborative canvas CRUD and participant presence
- COLLAB-02: Wire CollaborationPanel to real store methods (remove demo mode, "Coming Soon" badge)
- COLLAB-03: Enable VITE_ENABLE_COLLABORATION feature flag with documentation

**Depends on:** None
**Plans:** 1 plan

Plans:
- [ ] 03-PLAN.md — Full collaboration restoration (Wave 1: backend Edge Function + DB; Wave 2: frontend wire-up + env var)
