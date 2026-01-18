# BRIKA — Agent Guide

> This document is optimized for AI coding assistants working on the BRIKA codebase.

## Quick Reference

| What              | Where                                                   |
|-------------------|---------------------------------------------------------|
| Hub entry         | `apps/hub/src/main.ts`                                  |
| API server        | `apps/hub/src/runtime/http/api-server.ts`               |
| Plugin manager    | `apps/hub/src/runtime/plugins/plugin-manager.ts`        |
| Block registry    | `apps/hub/src/runtime/blocks/block-registry.ts`         |
| Workflow executor | `apps/hub/src/runtime/automations/workflow-executor.ts` |
| SDK exports       | `packages/sdk/src/index.ts`                             |
| Plugin context    | `packages/sdk/src/context.ts`                           |
| Block definition  | `packages/sdk/src/blocks/reactive-define.ts`            |
| Flow library      | `packages/flow/src/flow.ts`                             |
| Shared types      | `packages/shared/src/types.ts`                          |
| Config            | `brika.yml`                                             |

---

## 1. What is BRIKA?

**BRIKA** = Block-based Reactive Intelligent Knowledge Automation

A Bun-first home automation runtime with:

- **Isolated plugins** — Each plugin runs as a separate Bun process
- **Binary IPC** — JSON-framed communication between Hub and plugins
- **Reactive blocks** — Type-safe blocks with Zod schemas and reactive streams
- **Visual workflows** — React Flow-based automation builder
- **Event-driven** — Pub/sub event bus with glob pattern matching

---

## 2. Architecture Rules

### Hard Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        IMPORTS                                   │
├─────────────────────────────────────────────────────────────────┤
│ Hub can import: @brika/shared, @brika/sdk (types only)          │
│ Plugins can import: @brika/sdk, @brika/shared                   │
│ UI can import: @brika/shared                                    │
│                                                                 │
│ Hub NEVER imports plugin code in-process                        │
│ Plugins NEVER import Hub code                                   │
└─────────────────────────────────────────────────────────────────┘
```

### ID Naming Convention

```
Plugin ID:  @brika/plugin-timer           (from package.json name)
Block ID:   @brika/plugin-timer:timer     (pluginId:localBlockId)
Block ID:   @brika/blocks-builtin:condition
```

---

## 3. Coding Conventions

### TypeScript

```typescript
// ✅ Explicit types for public APIs
export function registerBlock(block: BlockDefinition): void { }

// ✅ Use interfaces for data, types for unions
interface BlockDefinition { id: string; name: string; }
type BlockResult = { output?: string } | { error: string };

// ✅ Prefer Map/Set for hot paths
const blocks = new Map<string, BlockHandler>();

// ❌ Avoid any - use unknown and narrow
function handle(msg: unknown) {
  if (isValidMessage(msg)) { /* now typed */ }
}
```

### Async/Error Handling

```typescript
// ✅ Return structured results, never throw across IPC
async function executeBlock(): Promise<BlockResult> {
  return { ok: true };
  // or
  return { ok: false, error: "Error message" };
}

// ✅ Catch and log at boundaries
try {
  await plugin.load(ref);
} catch (e) {
  logs.error("plugin.load.failed", { ref, error: String(e) });
}
```

### Dependency Injection

```typescript
import { singleton, inject } from "@brika/shared";

@singleton()
export class MyService {
  // ✅ Property injection with inject()
  private readonly events = inject(EventBus);
  private readonly blocks = inject(BlockRegistry);
  private readonly logs = inject(Logger);

  // ✅ No constructor parameters for DI classes
}
```

### File Organization

```
feature/
├── index.ts          # Public exports only
├── types.ts          # Types/interfaces
├── service.ts        # Main service class
└── utils.ts          # Helper functions
```

### Naming

```typescript
// Services: PascalCase with descriptive suffix
class PluginManager { }
class BlockRegistry { }
class EventBus { }

// Functions: camelCase, verb-first
function registerBlock() { }
function executeWorkflow() { }
function parseExpression() { }

// Constants: SCREAMING_SNAKE for true constants
const DEFAULT_TIMEOUT_MS = 30000;
const CORS_HEADERS = { ... };

// Private: # prefix for truly private
class Service {
  #privateState = new Map();
  async #privateMethod() { }
}
```

---

## 4. Plugin Development

### Minimal Plugin

```typescript
// plugins/my-plugin/src/main.ts
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

export const myBlock = defineReactiveBlock(
  {
    id: "my-block",
    inputs: {
      in: input(z.generic(), { name: "Input" }),
    },
    outputs: {
      out: output(z.passthrough("in"), { name: "Output" }),
    },
    config: z.object({
      value: z.string().describe("Configuration value"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      log("info", `Processing: ${JSON.stringify(data)}`);
      outputs.out.emit(data);
    });
  }
);

onStop(() => log("info", "Plugin stopping"));
log("info", "My plugin loaded");
```

### Plugin package.json

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "description": "My plugin description",
  "author": "Your Name",
  "type": "module",
  "main": "./src/main.ts",
  "exports": { ".": "./src/main.ts" },
  "blocks": [
    {
      "id": "my-block",
      "name": "My Block",
      "description": "Does something",
      "category": "action",
      "icon": "zap",
      "color": "#3b82f6"
    }
  ],
  "dependencies": {
    "@brika/sdk": "workspace:*"
  }
}
```

### Defining Blocks with Reactive Streams

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  combine,
  map,
  filter,
  delay,
  z,
} from "@brika/sdk";

export const processBlock = defineReactiveBlock(
  {
    id: "process",
    inputs: {
      a: input(z.number(), { name: "Value A" }),
      b: input(z.number(), { name: "Value B" }),
    },
    outputs: {
      sum: output(z.number(), { name: "Sum" }),
      filtered: output(z.number(), { name: "Filtered" }),
    },
    config: z.object({
      threshold: z.number().default(10),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    // Combine inputs and compute sum
    combine(inputs.a, inputs.b)
      .pipe(map(([a, b]) => a + b))
      .to(outputs.sum);

    // Filter values above threshold
    inputs.a
      .pipe(filter((v) => v > config.threshold))
      .to(outputs.filtered);

    log("info", "Process block started");
  }
);
```

---

## 5. UI Development

### Feature Module Structure

```
features/myfeature/
├── index.ts           # Export page + hooks
├── MyFeaturePage.tsx  # Main page component
├── api.ts             # API client functions
├── hooks.ts           # React Query hooks
└── store.ts           # Zustand store (if needed)
```

### API Pattern

```typescript
// api.ts
export async function fetchItems(): Promise<Item[]> {
  const res = await fetch("/api/items");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export async function createItem(data: CreateInput): Promise<Item> {
  const res = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

### Hook Pattern

```typescript
// hooks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchItems, createItem } from "./api";

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: fetchItems,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

### Component Pattern

```tsx
// MyPage.tsx
import { useItems } from "./hooks";
import { Button, Card, Skeleton } from "@/components/ui";

export function MyPage() {
  const { data: items = [], isLoading } = useItems();

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id}>...</Card>
      ))}
    </div>
  );
}
```

---

## 6. Common Tasks

### Adding a New Block

1. Create block in plugin: `plugins/my-plugin/src/main.ts`
2. Add metadata to `package.json` blocks array
3. Ensure plugin is in `brika.yml` install section

### Adding an API Endpoint

1. Create route file: `apps/hub/src/runtime/http/routes/my-route.ts`
2. Import and use in `api-server.ts`
3. Update UI API client if needed

### Adding a Hub Service

1. Create service file: `apps/hub/src/runtime/myservice/my-service.ts`
2. Use `@singleton()` decorator
3. Inject dependencies with `inject()`
4. Initialize in `apps/hub/src/runtime/app.ts`

---

## 7. Testing

### Test Files

```
apps/hub/src/__tests__/        # Hub tests
packages/sdk/src/__tests__/    # SDK tests
packages/flow/tests/           # Flow library tests
```

### Running Tests

```bash
bun test                       # All tests
bun test --watch               # Watch mode
bun test apps/hub              # Hub tests only
```

---

## 8. Commands

```bash
# Development
bun install                   # Install dependencies
bun run dev                   # Start hub + ui (concurrently)
bun run dev:hub               # Hub only
bun run dev:ui                # UI only

# Quality
bun test                      # Run all tests
bun run tsc                   # Type checking
bun run lint                  # Biome linting
bun run lint:fix              # Fix linting issues

# Build
bun run --cwd apps/ui build   # Build UI for production
```

---

## 9. Troubleshooting

### Plugin not loading?

1. Check entry point in `package.json` main/exports
2. Verify package.json name matches expected plugin ID
3. Check terminal for stderr output
4. Run directly: `bun run plugins/my-plugin/src/main.ts`

### Blocks not appearing?

1. Verify block is defined with `defineReactiveBlock`
2. Check Hub logs for `block.registered`
3. Ensure plugin is listed in `brika.yml` install section
4. Check blocks array in plugin's package.json

### IPC issues?

1. **NEVER use console.log in plugins** (breaks IPC)
2. Use `log()` from SDK instead
3. Verify all IPC messages are JSON-serializable
4. Check heartbeat timeout settings
