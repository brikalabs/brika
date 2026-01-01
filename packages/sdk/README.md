# @elia/sdk

Plugin SDK for ELIA home automation runtime.

## Installation

```bash
bun add @elia/sdk
```

## Quick Start

```typescript
import { createPluginRuntime, defineTool, z } from "@elia/sdk";

// Create plugin runtime
const { api, start, use } = createPluginRuntime({
  id: "@elia/plugin-my-plugin",  // Must match package.json name
  version: "0.1.0",
});

// Define a tool
export const myTool = defineTool({
  id: "action",
  description: "Do something",
  schema: z.object({
    input: z.string().describe("The input value"),
    count: z.number().optional().describe("Optional count"),
  }),
}, async (args, ctx) => {
  // args is fully typed: { input: string; count?: number }
  api.log("info", `Processing: ${args.input}`);
  return { ok: true, content: `Done: ${args.input}` };
});

// Register and start
use(myTool);
await start();
```

## Defining Tools

Tools are callable functions that plugins expose to the Hub.

```typescript
import { defineTool, z } from "@elia/sdk";

export const setTimer = defineTool({
  id: "set",                          // Local ID (becomes "pluginId:set")
  description: "Set a timer",
  schema: z.object({
    seconds: z.number().min(1).max(86400).describe("Duration in seconds"),
    name: z.string().optional().describe("Timer name"),
  }),
}, async (args, ctx) => {
  // args: { seconds: number; name?: string }
  // ctx: { traceId: string; source: "api" | "ui" | ... }
  
  if (args.seconds > 3600) {
    return { ok: false, content: "Duration too long" };
  }
  
  return {
    ok: true,
    content: `Timer set for ${args.seconds}s`,
    data: { id: "timer-1", seconds: args.seconds },
  };
});
```

## Defining Blocks

Blocks are workflow components with inputs/outputs for visual automation.

```typescript
import { defineBlock, z, expr } from "@elia/sdk";

export const conditionBlock = defineBlock({
  id: "condition",
  name: "Condition",
  description: "Branch based on condition",
  category: "flow",
  icon: "git-branch",          // Lucide icon name
  color: "#f59e0b",            // Hex color
  inputs: [
    { id: "in", name: "Input" }
  ],
  outputs: [
    { id: "then", name: "Then", type: "success" },
    { id: "else", name: "Else", type: "error" },
  ],
  schema: z.object({
    expression: z.string().describe("Condition expression"),
  }),
}, async (config, ctx, runtime) => {
  // Evaluate expression with context
  const result = expr(config.expression, ctx);
  
  runtime.log("info", `Condition: ${result}`);
  
  return {
    output: result ? "then" : "else",
    data: result,
  };
});
```

### Block Context

```typescript
interface BlockContext {
  trigger: {
    type: string;         // Event type
    payload: Json;        // Event payload
    source: string;       // Event source
    ts: number;           // Timestamp
  };
  vars: Record<string, Json>;  // Workflow variables
  input: Json;                 // Data from previous block
  inputs: Record<string, Json>; // All input port values
  item?: Json;                  // Loop item
  index?: number;               // Loop index
}
```

### Block Runtime

```typescript
interface BlockRuntime {
  callTool(name: string, args: Record<string, Json>): Promise<Json>;
  emit(type: string, payload: Json): void;
  log(level: "debug" | "info" | "warn" | "error", message: string): void;
  evaluate<T>(expression: string, ctx: BlockContext): T;
  setVar(name: string, value: Json): void;
  getVar(name: string): Json | undefined;
}
```

## Expression Syntax

Use `{{ }}` for dynamic values:

```typescript
// In block config
const message = expr("Hello {{ trigger.payload.name }}!", ctx);
const value = expr("{{ vars.counter + 1 }}", ctx);
```

Available variables:
- `trigger.*` - Event data
- `vars.*` - Workflow variables
- `input` - Previous block output
- `item`, `index` - Loop context

## Plugin API

```typescript
const { api, start, use, useBlock } = createPluginRuntime({ ... });

// Logging
api.log("info", "Message", { meta: "data" });
api.log("warn", "Warning");
api.log("error", "Error");

// Events
api.emit("my.event", { data: "value" });
api.on("other.*", (event) => {
  console.log(event.type, event.payload);
});
api.off("other.*");

// Lifecycle
api.onStop(() => {
  // Cleanup before shutdown
});
```

## Type Guards

```typescript
import { isCompiledTool, isCompiledBlock } from "@elia/sdk";

// Check if a value is a tool
if (isCompiledTool(value)) {
  console.log(value.id, value.description);
}

// Check if a value is a block
if (isCompiledBlock(value)) {
  console.log(value.id, value.category);
}
```

## Package.json Schema

Use the schema for IDE autocomplete:

```json
{
  "$schema": "../../packages/sdk/elia-plugin.schema.json",
  "name": "@elia/plugin-my-plugin",
  "version": "0.1.0",
  "description": "My plugin description",
  "author": "Your Name",
  "keywords": ["keyword1", "keyword2"],
  "icon": "./icon.png",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@elia/sdk": "workspace:*"
  }
}
```

## Exports

```typescript
// Tool definition
export { defineTool, isCompiledTool, z } from "@elia/sdk";
export type { CompiledTool, ToolResult, ToolCallContext } from "@elia/sdk";

// Block definition
export { defineBlock, isCompiledBlock, expr, parseDuration } from "@elia/sdk";
export type { CompiledBlock, BlockResult, BlockContext, BlockRuntime } from "@elia/sdk";

// Plugin runtime
export { createPluginRuntime } from "@elia/sdk";

// IPC (advanced)
export { FrameReader, FrameWriter } from "@elia/sdk";
export type { Wire } from "@elia/sdk";
```

