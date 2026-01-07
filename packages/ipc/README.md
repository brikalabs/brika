# @brika/ipc

Type-safe binary IPC (Inter-Process Communication) for BRIKA plugins. Enables communication between the hub and isolated plugin processes.

## Features

- **Type-safe messaging** - Full TypeScript inference for messages and RPCs
- **Bun IPC** - Uses `Bun.spawn` with native IPC for fast communication
- **Bidirectional** - Both request/response and fire-and-forget patterns
- **Contract-based** - Define message schemas with Zod
- **Auto-cleanup** - Graceful process lifecycle management

## Installation

```bash
npm install @brika/ipc
```

## Usage

### Defining Messages

```typescript
import { message, rpc } from '@brika/ipc';
import { z } from 'zod';

// Fire-and-forget message
const logEvent = message('log', z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
}));

// Request/response RPC
const callTool = rpc('call-tool', {
  input: z.object({
    tool: z.string(),
    args: z.record(z.unknown()),
  }),
  output: z.object({
    ok: z.boolean(),
    content: z.string(),
  }),
});
```

### Plugin Side (Client)

```typescript
import { createClient } from '@brika/ipc';
import { callTool, registerTool } from '@brika/ipc/contract';

const client = createClient();

// Implement RPC handler
client.implement(callTool, async ({ tool, args }) => {
  // Handle tool call from hub
  return { ok: true, content: 'Done' };
});

// Send messages to hub
client.send(registerTool, { 
  tool: { id: 'my-tool', description: 'Does something' } 
});

// Start the client
client.start({ 
  id: '@my/plugin', 
  version: '1.0.0' 
});
```

### Hub Side (Host)

```typescript
import { spawnPlugin } from '@brika/ipc';
import { callTool, hello, registerTool } from '@brika/ipc/contract';

// Spawn plugin process
const plugin = spawnPlugin('bun', ['./my-plugin.ts']);

// Listen for messages
plugin.on(hello, ({ plugin }) => {
  console.log(`Plugin started: ${plugin.id}`);
});

plugin.on(registerTool, ({ tool }) => {
  console.log(`Tool registered: ${tool.id}`);
});

// Call plugin RPC
const result = await plugin.call(callTool, {
  tool: 'my-tool',
  args: { value: 42 },
  ctx: { traceId: 'abc', source: 'api' },
});

// Cleanup
await plugin.stop();
```

## Built-in Contract

The `@brika/ipc/contract` export provides the standard BRIKA plugin protocol:

### Lifecycle Messages

| Message | Direction | Description |
|---------|-----------|-------------|
| `hello` | Plugin → Hub | Plugin announces itself on startup |
| `goodbye` | Plugin → Hub | Plugin announces shutdown |

### Tool Messages

| Message | Direction | Description |
|---------|-----------|-------------|
| `registerTool` | Plugin → Hub | Register a tool definition |
| `callTool` | Hub → Plugin | Execute a tool (RPC) |

### Block Messages

| Message | Direction | Description |
|---------|-----------|-------------|
| `registerBlock` | Plugin → Hub | Register a block definition |

### Event Messages

| Message | Direction | Description |
|---------|-----------|-------------|
| `emitEvent` | Plugin → Hub | Emit an event |
| `subscribeEvent` | Plugin → Hub | Subscribe to events |
| `eventOccurred` | Hub → Plugin | Deliver subscribed event |

## API Reference

### Client (Plugin Side)

```typescript
const client = createClient(options?: ClientOptions);

client.send(message, payload);              // Send fire-and-forget
client.implement(rpc, handler);             // Handle incoming RPC
client.start(pluginInfo);                   // Start client loop
```

### Host (Hub Side)

```typescript
const plugin = spawnPlugin(command, args, options?);

plugin.on(message, handler);                // Listen for messages
plugin.call(rpc, input);                    // Call RPC (returns Promise)
plugin.stop();                              // Graceful shutdown
plugin.kill();                              // Force kill
```

### Message/RPC Definition

```typescript
// Fire-and-forget message
const msg = message(name, payloadSchema);

// Request/response RPC
const call = rpc(name, { input: schema, output: schema });

// Type utilities
type Payload = PayloadOf<typeof msg>;
type Input = InputOf<typeof call>;
type Output = OutputOf<typeof call>;
```

## Protocol Details

Messages are JSON objects sent via Bun's native IPC (`Bun.spawn` with `ipc` option):

```typescript
interface WireMessage {
  t: string;      // Message type name
  _id?: number;   // Request ID (for RPC correlation)
  [key: string]: unknown; // Payload fields
}
```

- `t`: Message/RPC name (e.g., `"hello"`, `"call-tool"`)
- `_id`: Present for RPC requests/responses, used to correlate
- Response messages have type `{name}Result` (e.g., `"call-toolResult"`)

## License

MIT

