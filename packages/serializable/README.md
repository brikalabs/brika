# @brika/serializable

Extensible serialization system for BRIKA with support for custom types and Zod schema integration.

## Features

- **Type-safe serialization** - Serialize/deserialize complex types to JSON
- **Built-in transformers** - Date, Map, Set, Uint8Array, Buffer, Blob
- **Custom transformers** - Register your own type transformers
- **Async support** - Handle async serialization (e.g., Blob)
- **Zod integration** - Extended Zod schemas with custom types

## Installation

```bash
npm install @brika/serializable
```

## Usage

### Basic Serialization

```typescript
import { defaultRegistry } from '@brika/serializable';

// Serialize complex data
const data = {
  date: new Date(),
  items: new Set([1, 2, 3]),
  meta: new Map([['key', 'value']]),
  binary: new Uint8Array([1, 2, 3]),
};

const serialized = await defaultRegistry.serialize(data);
// Safe to JSON.stringify and send over the wire

const restored = await defaultRegistry.deserialize(serialized);
// All types are restored: Date, Set, Map, Uint8Array
```

### Sync Serialization

For performance-critical paths without async types:

```typescript
import { defaultRegistry } from '@brika/serializable';

const data = { date: new Date(), count: 42 };

// Sync version (throws if async type encountered)
const serialized = defaultRegistry.serializeSync(data);
const restored = defaultRegistry.deserializeSync(serialized);
```

### Custom Transformers

Register transformers for your own types:

```typescript
import { registerTransformer, type Transformer } from '@brika/serializable';

class Point {
  constructor(public x: number, public y: number) {}
}

const PointTransformer: Transformer<Point, { x: number; y: number }> = {
  name: 'Point',
  isApplicable: (v): v is Point => v instanceof Point,
  serialize: (p) => ({ x: p.x, y: p.y }),
  deserialize: (data) => new Point(data.x, data.y),
};

registerTransformer(PointTransformer);
```

### Custom Registry

Create isolated registries for different contexts:

```typescript
import { TransformerRegistry, Uint8ArrayTransformer } from '@brika/serializable';

const registry = new TransformerRegistry()
  .register(Uint8ArrayTransformer);
  // Only Uint8Array, no Blob/Buffer

const serialized = await registry.serialize(data);
```

## Built-in Transformers

| Type | Serialized Format | Async |
|------|-------------------|-------|
| `Date` | ISO string | No |
| `Map` | Array of `[key, value]` pairs | No |
| `Set` | Array of values | No |
| `Uint8Array` | Base64 string | No |
| `Buffer` | Base64 string | No |
| `Blob` | `{ data: base64, type: mimeType }` | Yes |

## Zod Schema Integration

Extended Zod schemas for BRIKA types:

```typescript
import { z } from '@brika/serializable';

const schema = z.object({
  duration: z.duration(),      // Duration in ms
  color: z.color(),            // Hex color
  icon: z.icon(),              // Lucide icon name
  generic: z.generic(),        // Any serializable value
  passthrough: z.passthrough('inputPort'), // Schema passthrough
});
```

## API Reference

### TransformerRegistry

- `register(transformer)` - Register a custom transformer
- `serialize(value)` - Async serialize value
- `deserialize(value)` - Async deserialize value
- `serializeSync(value)` - Sync serialize (throws on async types)
- `deserializeSync(value)` - Sync deserialize
- `findForValue(value)` - Find transformer for a value
- `findByName(name)` - Find transformer by type name

### Transformer Interface

```typescript
interface Transformer<T, S = unknown> {
  name: string;                              // Unique type identifier
  isApplicable(value: unknown): value is T;  // Type guard
  serialize(value: T): S | Promise<S>;       // To JSON-safe format
  deserialize(data: S): T | Promise<T>;      // From JSON-safe format
  isAsync?: boolean;                         // Mark async transformers
}
```

## License

MIT

