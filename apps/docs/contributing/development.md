# Development Guide

This guide covers contributing to BRIKA.

## Prerequisites

* [Bun](https://bun.sh/) 1.0 or later
* [Node.js](https://nodejs.org/) 18+ (for some tooling)
* Git
* A code editor (VS Code recommended)

## Setup

### Clone the Repository

```bash
git clone https://github.com/maxscharwath/brika.git
cd brika
```

### Install Dependencies

```bash
bun install
```

### Start Development

```bash
bun run dev
```

This starts both the Hub and UI in watch mode.

## Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Hub and UI |
| `bun run dev:hub` | Start Hub only |
| `bun run dev:ui` | Start UI only |
| `bun test` | Run all tests |
| `bun run tsc` | Type check all packages |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix lint errors |

## Project Layout

### Apps

* `apps/hub/` — Bun runtime (API, plugins, workflows)
* `apps/ui/` — React frontend (TanStack, React Flow)
* `apps/registry/` — Plugin registry (Cloudflare Worker)
* `apps/schema-cdn/` — Schema CDN (Cloudflare Worker)

### Packages

* `packages/sdk/` — Plugin SDK
* `packages/flow/` — Reactive streams
* `packages/events/` — Event system
* `packages/ipc/` — Binary IPC protocol
* `packages/shared/` — Shared types and DI

### Plugins

* `plugins/blocks-builtin/` — Core workflow blocks
* `plugins/timer/` — Timer blocks
* `plugins/example-echo/` — Example plugin

## Adding Features

### New Hub Service

1. Create file: `apps/hub/src/runtime/<service>/<service>.ts`
2. Use `@singleton()` decorator
3. Inject dependencies with `inject()`
4. Initialize in bootstrap

```typescript
import { singleton, inject } from "@brika/shared";
import { Logger } from "../logs/logger";

@singleton()
export class MyService {
  private readonly logs = inject(Logger);

  async doSomething() {
    this.logs.info("Doing something");
  }
}
```

### New API Endpoint

Edit `apps/hub/src/runtime/http/api-server.ts`:

```typescript
if (p === "/api/myendpoint" && m === "GET") {
  return json(await this.myService.list());
}

if (p === "/api/myendpoint" && m === "POST") {
  const body = await req.json();
  return json(await this.myService.create(body));
}
```

### New UI Feature

Create feature directory: `apps/ui/src/features/myfeature/`

```
myfeature/
├── index.ts           # export { MyPage } from "./MyPage"
├── MyPage.tsx         # React component
├── api.ts             # API functions
└── hooks.ts           # React Query hooks
```

Add route in `apps/ui/src/main.tsx`:

```typescript
import { MyPage } from "./features/myfeature";

// In router configuration
{
  path: "/myfeature",
  element: <MyPage />,
}
```

### New Plugin

See [Create a Plugin](../plugins/create-plugin.md).

### New Block

1. Create block in plugin: `plugins/<name>/src/blocks/my-block.ts`
2. Export from plugin entry point
3. Add to `package.json` blocks array

## Testing

### Run Tests

```bash
# All tests
bun test

# Watch mode
bun test --watch

# Specific directory
bun test apps/hub
```

### Write Tests

```typescript
import { describe, test, expect } from "bun:test";

describe("MyService", () => {
  test("should do something", () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });

  test("should handle errors", async () => {
    await expect(failingFunction()).rejects.toThrow();
  });
});
```

### Test Locations

* Hub tests: `apps/hub/src/__tests__/`
* SDK tests: `packages/sdk/src/__tests__/`
* Package tests: `packages/<name>/src/__tests__/`

## Debugging

### Hub Debugging

```bash
# With debug output
DEBUG=brika:* bun run dev:hub
```

### UI Debugging

Use React DevTools and browser developer tools.

### Plugin Debugging

Plugins write to the hub's log stream:

```typescript
log.debug('Debug information');
```

View logs at http://localhost:5173/logs

## Pull Request Guidelines

1. **One feature per PR** — Keep PRs focused
2. **Update docs** — If adding new features
3. **Add tests** — For new functionality
4. **Follow conventions** — Match existing code style
5. **No console.log** — Remove debug statements
6. **Run lint** — `bun run lint:fix`

## Commit Messages

Use conventional commits:

```
feat: add timer cancel functionality
fix: resolve block execution timeout
docs: update plugin development guide
refactor: simplify workflow executor
test: add event bus tests
chore: update dependencies
```
