# Testing

IdeaScape uses **Vitest** as its test runner with **jsdom** as the browser environment.

---

## Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npx vitest

# Run a specific test file
npx vitest src/app/store/canvasStore.test.ts
```

---

## Test Configuration

### `vitest.config.ts`

| Setting | Value |
|---------|-------|
| Environment | `jsdom` |
| Globals | `true` (describe, it, expect, vi available without import) |
| Setup file | `./vitest.setup.ts` |
| Test pattern | `src/**/*.test.ts` |
| Pool | Threads (single-threaded mode) |

### `vitest.setup.ts`

Provides a mock `localStorage` implementation using an in-memory `Map`. This replaces the browser's native `Storage` API because jsdom's implementation can be inconsistent. Storage is cleared before each test via `beforeEach`.

---

## Current Test Coverage

| File | Tests | Category |
|------|-------|----------|
| `src/app/store/canvasStore.test.ts` | ✓ | Store integrity — node CRUD, connections, groups, undo/redo, stats |
| `src/app/services/aiService.test.ts` | ✓ | AI service logic |
| `src/app/components/ChatDialog.test.ts` | ✓ | Chat dialog component |
| `src/app/components/ChatDialogStatus.test.ts` | ✓ | Chat dialog status states |
| `src/server/aiProxy.test.ts` | ✓ | AI proxy handler |

**5 test files total** with smoke and unit tests.

---

## Writing Tests

### Test File Location

Tests live alongside source files using a `.test.ts` suffix:

```
src/app/store/canvasStore.ts        # Source
src/app/store/canvasStore.test.ts    # Test
```

### Test Patterns

**Store tests** (Zustand):

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'

describe('canvasStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useCanvasStore.setState(useCanvasStore.getInitialState())
  })

  it('should add a node', () => {
    useCanvasStore.getState().addNode({ type: 'text', x: 0, y: 0 })
    const nodes = useCanvasStore.getState().nodes
    expect(nodes).toHaveLength(1)
  })
})
```

**Component tests:**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatDialog } from './ChatDialog'

describe('ChatDialog', () => {
  it('renders without crashing', () => {
    render(<ChatDialog />)
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})
```

> Note: The project currently does not have `@testing-library/react` as a dependency. Component tests use manual rendering patterns.

### Available Utilities

- `vi.fn()` — Mock functions
- `vi.mock()` — Module mocking
- `localStorage` — In-memory mock (auto-cleared before each test)
- No DOM rendering library is pre-configured — add one if component tests require it

---

## Coverage

To generate a coverage report:

```bash
npx vitest --coverage
```

<!-- VERIFY: Code coverage requires `@vitest/coverage-v8` or similar package to be installed -->
