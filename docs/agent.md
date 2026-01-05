# BRIKA — Agent Guide

> This document is optimized for AI coding assistants working on the BRIKA codebase.

## Quick Reference

| What              | Where                                                   |
|-------------------|---------------------------------------------------------|
| Hub entry         | `apps/hub/src/main.ts`                                  |
| API server        | `apps/hub/src/runtime/http/api-server.ts`               |
| Plugin manager    | `apps/hub/src/runtime/plugins/plugin-manager.ts`        |
| Tool registry     | `apps/hub/src/runtime/tools/tool-registry.ts`           |
| Block registry    | `apps/hub/src/runtime/blocks/block-registry.ts`         |
| Workflow executor | `apps/hub/src/runtime/automations/workflow-executor.ts` |
| SDK exports       | `packages/sdk/src/index.ts`                             |
| Plugin runtime    | `packages/sdk/src/runtime.ts`                           |
| Tool definition   | `packages/sdk/src/tool.ts`                              |
| Block definition  | `packages/sdk/src/blocks/define.ts`                     |
| Shared types      | `packages/shared/src/types.ts`                          |
| Config            | `brika.yml`                                              |

---

## 1. What is BRIKA?

**BRIKA** = 

A Bun-first home automation runtime with:

- **Isolated plugins** - Each plugin runs as a separate Bun process
- **Binary IPC** - JSON-framed communication between Hub and plugins
- **Block-based workflows** - Visual automation builder with React Flow
- **Event-driven** - Pub/sub event bus with glob pattern matching

---

## 2. Architecture Rules

### Hard Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                        IMPORTS                           │
├─────────────────────────────────────────────────────────┤
│ Hub can import: @brika/shared, @brika/sdk (types only)    │
│ Plugins can import: @brika/sdk, @brika/shared             │
│ UI can import: @brika/shared                             │
│                                                          │
│ Hub NEVER imports plugin code in-process                │
│ Plugins NEVER import Hub code                           │
└─────────────────────────────────────────────────────────┘
```

### ID Naming Convention

```
Plugin ID:  @brika/plugin-timer       (from package.json name)
Tool ID:    @brika/plugin-timer:set   (pluginId:localId)
Block ID:   @brika/blocks-builtin:condition
```

---

## 3. Coding Conventions

### TypeScript

```typescript
// ✅ Explicit types for public APIs
export function createTool(spec: ToolSpec): CompiledTool { }

// ✅ Use interfaces for data, types for unions
interface BlockDefinition { id: string; name: string; }
type BlockResult = { output?: string } | { error: string };

// ✅ Prefer Map/Set for hot paths
const tools = new Map<string, ToolHandler>();

// ❌ Avoid any - use unknown and narrow
function handle(msg: unknown) {
  if (isValidMessage(msg)) { /* now typed */ }
}
```

### Async/Error Handling

```typescript
// ✅ Return structured results, never throw across IPC
async function callTool(): Promise<ToolResult> {
  return { ok: true, content: "Done" };
  // or
  return { ok: false, content: "Error message" };
}

// ✅ Blocks return BlockResult
async function execute(): Promise<BlockResult> {
  if (error) return { error: "message", stop: true };
  return { output: "then", data: result };
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
  private readonly tools = inject(ToolRegistry);
  private readonly logs = inject(LogRouter);
  
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
class ToolRegistry { }
class EventBus { }

// Functions: camelCase, verb-first
function registerTool() { }
function executeBlock() { }
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
// plugins/my-plugin/src/index.ts
import { createPluginRuntime, defineTool, z } from "@brika/sdk";

const { api, start, use } = createPluginRuntime({
  id: "@brika/plugin-my-plugin",  // Must match package.json name
  version: "0.1.0",
});

export const myTool = defineTool({
  id: "action",
  description: "Do something",
  schema: z.object({
    input: z.string(),
  }),
}, async (args) => {
  return { ok: true, content: `Result: ${args.input}` };
});

use(myTool);

await start();
```

### Plugin package.json

```json
{
  "$schema": "../../packages/sdk/brika-plugin.schema.json",
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "description": "My plugin description",
  "author": "Your Name",
  "keywords": ["keyword1", "keyword2"],
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@brika/sdk": "workspace:*"
  }
}
```

### Defining Blocks

```typescript
import { defineBlock, z, expr } from "@brika/sdk";

export const myBlock = defineBlock({
  id: "my-block",
  name: "My Block",
  description: "Does something",
  category: "custom",
  icon: "zap",           // Lucide icon name
  color: "#3b82f6",      // Hex color
  inputs: [{ id: "in", name: "Input" }],
  outputs: [{ id: "out", name: "Output" }],
  schema: z.object({
    value: z.string().describe("The value"),
  }),
}, async (config, ctx, runtime) => {
  const evaluated = expr(config.value, ctx);
  runtime.log("info", `Processed: ${evaluated}`);
  return { output: "out", data: evaluated };
});
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
import { fetcher } from "@/lib/query";

export const myApi = {
  list: () => fetcher<Item[]>("/api/items"),
  getById: (id: string) => fetcher<Item>(`/api/items/${id}`),
  create: (data: CreateInput) => fetcher<Item>("/api/items", {
    method: "POST",
    body: JSON.stringify(data),
  }),
};

export const myKeys = {
  all: ["items"] as const,
  detail: (id: string) => ["items", id] as const,
};
```

### Hook Pattern

```typescript
// hooks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { myApi, myKeys } from "./api";

export function useItems() {
  return useQuery({
    queryKey: myKeys.all,
    queryFn: myApi.list,
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: myKeys.detail(id),
    queryFn: () => myApi.getById(id),
    enabled: !!id,
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

### Adding a New Tool

1. Create tool file in plugin: `plugins/my-plugin/src/tools/new-tool.ts`
2. Export from barrel: `plugins/my-plugin/src/tools/index.ts`
3. Register in entry: `use(newTool)` in `index.ts`

### Adding a New Block

1. Create block file: `plugins/blocks-builtin/src/blocks/my-block.ts`
2. Export from barrel: `plugins/blocks-builtin/src/blocks/index.ts`
3. Register in main: `plugin.useBlock(myBlock)` in `main.ts`

### Adding an API Endpoint

1. Edit `apps/hub/src/runtime/http/api-server.ts`
2. Add route in `#handle()` method
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
apps/hub/src/__tests__/        # Integration tests
packages/sdk/src/__tests__/    # Unit tests
```

### Running Tests

```bash
bun test                       # All tests
bun test --watch              # Watch mode
bun test apps/hub             # Hub tests only
```

---

## 8. Commands

```bash
# Development
bun install                   # Install dependencies
bun run dev                   # Start hub + ui (concurrently)
bun run --cwd apps/hub dev    # Hub only
bun run --cwd apps/ui dev     # UI only

# Testing
bun test                      # Run all tests
bun run tsc                   # Type checking

# Build
bun run --cwd apps/ui build   # Build UI for production
```

---

## 9. Troubleshooting

### Plugin not loading?

1. Check entry point in `package.json` exports
2. Verify package.json name matches ID in createPluginRuntime
3. Check terminal for stderr output
4. Run `bun run --cwd plugins/my-plugin src/index.ts` directly

### Blocks not appearing?

1. Verify `useBlock()` is called in plugin entry
2. Check Hub logs for `block.registered`
3. Ensure plugin is listed in `brika.yml` install section

### IPC issues?

1. Check for console.log in plugin (breaks IPC)
2. Verify all IPC messages are JSON-serializable
3. Check heartbeat timeout settings
