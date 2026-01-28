---
name: code
description: Apply project coding conventions when writing or reviewing code. Use when writing new code, refactoring, or reviewing pull requests.
argument-hint: [file or feature to work on]
---

# Coding Conventions

Apply these conventions when working on: $ARGUMENTS

---

## TypeScript Patterns

### Types vs Interfaces

| Use | For |
|-----|-----|
| `interface` | Object contracts, public APIs, extensible shapes |
| `type` | Unions, primitives, aliases, function signatures |

```typescript
interface BlockPort {
  id: string;
  direction: PortDirection;
}

type PortDirection = 'input' | 'output';
type ExecutionListener = (event: ExecutionEvent) => void;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
```

### Branded Types for IDs

Use Zod's `.brand()` instead of raw `string` or `number` for IDs:

```typescript
import { z } from 'zod';

const UserId = z.string().brand<'UserId'>();
const WorkflowId = z.string().brand<'WorkflowId'>();
const BlockId = z.string().brand<'BlockId'>();

type UserId = z.infer<typeof UserId>;
type WorkflowId = z.infer<typeof WorkflowId>;

function getUser(id: UserId): User { /* ... */ }
function getWorkflow(id: WorkflowId): Workflow { /* ... */ }

const userId = UserId.parse('user-123');
const workflowId = WorkflowId.parse('wf-456');

getUser(userId);
getUser(workflowId);  // Type error - can't mix ID types
```

---

### Private Class Members

Use `#` prefix with `readonly` for immutable private fields:

```typescript
@singleton()
export class MyService {
  readonly #deps = inject(OtherService);
  readonly #listeners = new Set<Listener>();
  #state: State | null = null;
}
```

### Generic Type Parameters

| Convention | Example |
|------------|---------|
| Single letter | `T`, `R`, `K`, `V` |
| Prefixed for clarity | `TPayload`, `TSchema`, `TNamespace` |
| Const for literals | `const TNamespace extends string` |

---

## Naming Conventions

### Functions

| Prefix | Purpose | Example |
|--------|---------|---------|
| `create*` | Factory functions | `createApp()`, `createEmitter()` |
| `define*` | Builder/definition | `defineBlock()`, `defineAction()` |
| `get*` | Getters/queries | `get()`, `getByName()` |
| `set*` | Setters/mutations | `setEnabled()`, `setState()` |
| `on*` | Event handlers | `onInit()`, `onStop()` |
| `is*` | Boolean checks | `isRunning()`, `isValid()` |
| `with*` | Modifiers/decorators | `withPredicate()`, `withSource()` |

### Variables

| Type | Convention | Example |
|------|------------|---------|
| Constants | `UPPER_SNAKE_CASE` | `LOG_LEVELS`, `HOT_CONTAINER_KEY` |
| Variables | `camelCase` | `queryObj`, `sourceVal` |
| Private fields | `#camelCase` | `#deps`, `#listeners` |
| Abbreviations | Avoid except standard | `deps`, `src`, `tgt` (acceptable) |

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| Directories | kebab-case | `src/runtime/logs/` |
| Components | PascalCase.tsx | `WorkflowEditor.tsx` |
| Utilities | camelCase.ts | `formatters.ts` |
| Tests | *.test.ts | `executor.test.ts` |

---

## Import Organization

Order imports in groups separated by blank lines:

```typescript
import type { Json, BlockPort } from '@/types';

import { z } from 'zod';
import { Hono } from 'hono';

import { inject, singleton } from '@brika/di';
import { createEmitter } from '@brika/events';

import { formatLog } from '@/formatters';
import { parseConfig } from '@/config';
```

1. Type imports (`import type`)
2. External dependencies
3. Internal packages (`@brika/*`)
4. Local files (use `@/` alias, not relative paths)

### Barrel Files and Re-exports

Avoid excessive barrel files (`index.ts`) and re-exports:

```typescript
// Package entry point - OK
// packages/events/src/index.ts
export { createEmitter } from './emitter';
export type { Emitter, EmitterOptions } from './types';

// Internal folder - AVOID barrel
// src/utils/index.ts ❌
export * from './format';
export * from './parse';
export * from './validate';

// Instead - import directly
import { formatDate } from '@/utils/format';
import { parseConfig } from '@/utils/parse';
```

**When to use barrels:**
- Package public API (`packages/*/src/index.ts`)
- Feature module public API (`features/*/index.ts`)

**Avoid:**
- Barrel files inside internal folders
- `export *` re-exports (be explicit)
- Re-exporting just to shorten import paths

---

## Error Handling

### Structured Results (IPC/Boundaries)

Never throw across process boundaries. Return structured results:

```typescript
async function doOperation(): Promise<Result> {
  const resource = findResource(id);
  if (!resource) {
    return { ok: false, error: `Resource not found: ${id}` };
  }

  try {
    const data = await process(resource);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
```

### When to Use Each Pattern

| Pattern | Use For |
|---------|---------|
| Structured `{ ok, data/error }` | IPC, API responses, cross-boundary |
| `throw` | Internal errors, programmer mistakes |
| Try-catch | Local error transformation, cleanup |

---

## Async/Await

Always use `async/await`, never raw Promise chains:

```typescript
async function processItems(items: Item[]): Promise<void> {
  for (const item of items) {
    await processItem(item);
  }
}

async function loadAll(): Promise<Data[]> {
  const results = await Promise.all([
    loadFirst(),
    loadSecond(),
    loadThird(),
  ]);

  return results.flat();
}
```

---

## Dependency Injection

Use `@brika/di` for all Hub services:

```typescript
import { inject, singleton } from '@brika/di';

@singleton()
export class MyService {
  readonly #logger = inject(Logger);
  readonly #config = inject(ConfigService);
  readonly #events = inject(EventBus);

  async initialize(): Promise<void> {
    this.#logger.info('Initializing...');
  }
}
```

---

## Feature Module Structure (UI)

```
src/features/<feature>/
├── index.ts          # Exports
├── <Feature>.tsx     # Main component
├── api.ts            # API functions
├── hooks.ts          # React hooks
├── store.ts          # Zustand store
├── types.ts          # Feature types
└── components/
    └── index.ts      # Feature components
```

---

## Formatting (Biome)

| Setting | Value |
|---------|-------|
| Line width | 100 |
| Indent | 2 spaces |
| Quotes | Single (`'`) |
| JSX Quotes | Double (`"`) |
| Semicolons | Always |
| Arrow params | Always parentheses |
| Trailing commas | ES5 |

---

## Avoid

- `any` type - use `unknown` and narrow with type guards
- `as` type casting - use type guards or generics instead
- `console.log` in plugins (breaks IPC)
- `var` (use `const` or `let`)
- Single-letter variables (except generics)
- Throwing across IPC boundaries
- Raw Promise chains (use async/await)
- Abstractions for one-time operations
- Over-engineering and premature optimization

### Instead of `any` and `as`

```typescript
function process(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (isValidPayload(data)) {
    return data.message;
  }
  throw new Error('Invalid data');
}

function isValidPayload(data: unknown): data is Payload {
  return typeof data === 'object' && data !== null && 'message' in data;
}
```

---

## Architecture Boundaries

```
Hub ↔ (IPC) ↔ Plugins (via @brika/sdk, @brika/shared)
UI  ↔ (HTTP) ↔ Hub
UI  → (Imports) → @brika/shared only
```

- Hub services use DI (`@singleton()` + `inject()`)
- Plugins use SDK context (`ctx.log()`, not `console.log()`)
- UI imports only from `@brika/shared` for types
