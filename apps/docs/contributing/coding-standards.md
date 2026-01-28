# Coding Standards

BRIKA follows consistent coding standards across the codebase.

## TypeScript

### Strict Mode

All TypeScript uses strict mode:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

### Type Annotations

Always type public APIs:

```typescript
// ✅ Good
export function processData(input: string): ProcessedData {
  return { result: input.trim() };
}

// ❌ Bad
export function processData(input) {
  return { result: input.trim() };
}
```

### Avoid `any`

Use `unknown` and narrow with type guards:

```typescript
// ✅ Good
function handleInput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  throw new Error("Expected string");
}

// ❌ Bad
function handleInput(value: any): string {
  return value;
}
```

If `any` is unavoidable, add a biome-ignore comment:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: External API returns any
const result: any = externalApi.call();
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `PluginManager` |
| Interfaces | PascalCase | `BlockDefinition` |
| Functions | camelCase | `registerTool` |
| Constants | SCREAMING_SNAKE | `DEFAULT_TIMEOUT` |
| Private members | # prefix | `#privateField` |
| Files | kebab-case | `plugin-manager.ts` |

## Code Organization

Order code in files consistently:

```typescript
// 1. Imports (external, then internal)
import { z } from "zod";
import { inject, singleton } from "@brika/di";

// 2. Types/Interfaces
interface MyConfig {
  timeout: number;
}

// 3. Constants
const DEFAULT_TIMEOUT = 30000;

// 4. Main export (class/function)
@singleton()
export class MyService {
  // ...
}

// 5. Helper functions (private)
function helperFunction(): void {
  // ...
}
```

## Error Handling

### Return Structured Results

For IPC communication, always return structured results:

```typescript
// ✅ Good
return { ok: true, content: "Success" };
return { ok: false, content: "Error: invalid input" };

// ❌ Bad - throws across IPC
throw new Error("Invalid input");
```

### Catch at Boundaries

Log errors at system boundaries:

```typescript
// ✅ Good
try {
  await operation();
} catch (e) {
  logs.error("operation.failed", { error: String(e) });
  return { ok: false, content: String(e) };
}
```

## Architecture Rules

### Hard Boundaries

Never cross these boundaries:

```typescript
// ❌ Hub NEVER imports plugin code
import { myTool } from "../../plugins/my-plugin";

// ❌ Plugins ONLY depend on SDK and shared
import { SomeHubClass } from "@brika/hub"; // Not allowed

// ❌ UI ONLY imports from shared
import { PluginManager } from "@brika/sdk"; // Not allowed
```

### Dependency Injection

Use the DI system for services:

```typescript
import { singleton, inject } from "@brika/di";

@singleton()
export class MyService {
  private readonly logger = inject(Logger);
  private readonly events = inject(EventBus);

  async doWork() {
    this.logger.info("Working...");
  }
}
```

### Private Members

Use `#` for private class members:

```typescript
@singleton()
export class MyService {
  #config: Config;
  #cache = new Map<string, Data>();

  #processData(input: string): Data {
    return { result: input };
  }
}
```

## Plugin Development

### Plugin Entry Point

```typescript
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

// Define blocks
export const myBlock = defineReactiveBlock(
  { /* spec */ },
  ({ inputs, outputs, config }) => { /* executor */ }
);

// Lifecycle hooks
onStop(() => log.info('Plugin stopping'));

// Startup log
log.info('Plugin loaded');
```

### Block Definition

```typescript
export const myBlock = defineReactiveBlock(
  {
    id: "my-block",  // Local ID only, not full path
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      result: output(z.string(), { name: "Result" }),
    },
    config: z.object({
      value: z.string().default("default"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.trigger.on(() => {
      log.info('Block triggered');
      outputs.result.emit(config.value);
    });
  }
);
```

## UI Components

### Component Pattern

```tsx
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchData } from "./api";

export function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-data"],
    queryFn: fetchData,
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{data.title}</h1>
      <Button onClick={() => {}}>Action</Button>
    </div>
  );
}
```

### Feature Module Pattern

```
features/myfeature/
├── index.ts           # Exports
├── MyPage.tsx         # Main component
├── api.ts             # API functions
└── hooks.ts           # React Query hooks
```

## Don't

* Don't use `console.log` in plugins (breaks IPC)
* Don't use `any` without biome-ignore comment
* Don't create abstractions for one-time operations
* Don't add features beyond what's requested
* Don't import hub code in plugins or vice versa
* Don't add backward compatibility shims — just change the code

## Versioning

BRIKA prioritizes clean code over backward compatibility:

* **Do** use semantic versioning
* **Do** delete old code completely
* **Do** bump major version for breaking changes
* **Don't** add deprecated functions
* **Don't** add feature flags for old behavior
