# Contributing to BRIKA

## Development Setup

```bash
# Clone and install
git clone <repo>
cd brika
bun install

# Start development
bun run dev
```

## Project Structure

```
brika/
├── apps/hub/         # Bun runtime
├── apps/ui/          # React frontend
├── packages/sdk/     # Plugin SDK
├── packages/shared/  # Shared types
├── plugins/          # Local plugins
├── automations/      # Workflow files
└── docs/             # Documentation
```

## Coding Standards

### TypeScript

- **Strict mode** - All TypeScript uses strict: true
- **Explicit types** - Always type public APIs
- **No any** - Use unknown and narrow with type guards
- **Prefer interfaces** - For object shapes
- **Prefer types** - For unions and aliases

### Naming Conventions

| Type            | Convention      | Example             |
|-----------------|-----------------|---------------------|
| Classes         | PascalCase      | `PluginManager`     |
| Interfaces      | PascalCase      | `BlockDefinition`   |
| Functions       | camelCase       | `registerTool`      |
| Constants       | SCREAMING_SNAKE | `DEFAULT_TIMEOUT`   |
| Private members | # prefix        | `#privateField`     |
| Files           | kebab-case      | `plugin-manager.ts` |

### Code Organization

```typescript
// 1. Imports (external, then internal)
import { z } from "zod";
import { inject } from "@brika/shared";

// 2. Types/Interfaces
interface MyInterface { }

// 3. Constants
const TIMEOUT_MS = 30000;

// 4. Main export (class/function)
@singleton()
export class MyService { }

// 5. Helper functions (private)
function helperFunction() { }
```

### Error Handling

```typescript
// ✅ Return structured results for IPC
return { ok: true, content: "Success" };
return { ok: false, content: "Error message" };

// ✅ Catch and log at boundaries
try {
  await operation();
} catch (e) {
  logs.error("operation.failed", { error: String(e) });
}

// ❌ Don't throw across IPC
throw new Error("Bad");  // Never in plugin handlers
```

## Adding Features

### New Tool

1. Create in plugin: `plugins/<name>/src/tools/my-tool.ts`
2. Export from barrel: `plugins/<name>/src/tools/index.ts`
3. Register: `use(myTool)` in entry point

### New Block

1. Create: `plugins/blocks-builtin/src/blocks/my-block.ts`
2. Export: `plugins/blocks-builtin/src/blocks/index.ts`
3. Register: `plugin.useBlock(myBlock)` in main.ts

### New API Endpoint

1. Edit: `apps/hub/src/runtime/http/api-server.ts`
2. Add route in `#handle()` method
3. Update UI if needed

### New Hub Service

1. Create: `apps/hub/src/runtime/<service>/<service>.ts`
2. Use `@singleton()` decorator
3. Initialize in `apps/hub/src/runtime/app.ts`

### New UI Feature

1. Create directory: `apps/ui/src/features/<feature>/`
2. Add files: `index.ts`, `api.ts`, `hooks.ts`, `Page.tsx`
3. Add route in `apps/ui/src/main.tsx`

## Testing

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Specific directory
bun test apps/hub
```

### Test Structure

```typescript
import { describe, test, expect } from "bun:test";

describe("MyService", () => {
  test("should do something", () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
```

## Pull Request Guidelines

1. **One feature per PR** - Keep PRs focused
2. **Update docs** - If adding new features
3. **Add tests** - For new functionality
4. **Follow conventions** - Match existing code style
5. **No console.log** - Remove debug statements

## Commit Messages

```
feat: add timer cancel functionality
fix: resolve block execution timeout
docs: update plugin development guide
refactor: simplify workflow executor
test: add event bus tests
```

## Architecture Rules

### Hard Boundaries

- Hub NEVER imports plugin code directly
- Plugins ONLY depend on @brika/sdk, @brika/shared
- UI ONLY imports from @brika/shared

### IPC Protocol

- All plugin communication via binary IPC
- Never throw exceptions across IPC
- Always return structured results

### Plugin Isolation

- Each plugin runs in separate Bun process
- Plugins don't share memory
- Hub supervises all plugins



