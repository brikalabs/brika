# Schema Types

The `z` exported from `@brika/sdk` is a curated subset of Zod plus a set of BRIKA-specific types that the workflow editor knows how to render. Import it from the SDK, never from `zod` directly — the SDK's `z` enforces the project's rules (no `unknown`, no `any` in ports) and adds the custom types listed below.

```ts
import { z } from '@brika/sdk';
```

## Standard Zod (re-exported)

These behave exactly like their Zod counterparts:

| Category | Types |
|---|---|
| Primitives | `string`, `number`, `boolean`, `bigint`, `date`, `symbol`, `null`, `void`, `nan`, `never` |
| Literals | `literal`, `enum` |
| Composites | `object`, `array`, `tuple`, `record`, `map`, `set` |
| Combinators | `union`, `discriminatedUnion`, `intersection` |
| Modifiers | `optional`, `nullable`, `coerce` |
| Advanced | `lazy`, `promise`, `function`, `preprocess`, `brand` |

## Forbidden

* **`z.unknown` and `z.any`** are not re-exported for port schemas. Use `z.generic()` instead so the UI can show the type as "any" and infer it from connections.

`z.any` *is* exported for use inside object schemas (`z.object({ payload: z.any() })`) — that's fine because it doesn't drive a port. The lint rule (and the SDK's API surface) catches the most common mistake.

## BRIKA-specific types

These render as special inputs in the workflow editor and the brick/preference config panels.

### `z.generic(typeVar?)`

A port that accepts any value. The type "flows through" connections — connect a `Flow<number>` to a `generic` input and the editor types that connection as `number`.

```ts
inputs: {
  trigger: input(z.generic(), { name: 'Trigger' }),
}
```

Optional argument: a type variable name (`'T'`, `'TInput'`) for the editor's display. The runtime does not enforce it.

### `z.passthrough(sourcePortId)`

An output whose type matches the named input port. Use for blocks that don't change the shape of their data:

```ts
inputs: {
  in: input(z.string(), { name: 'In' }),
},
outputs: {
  out: output(z.passthrough('in'), { name: 'Out' }),
}
```

The editor reads `passthrough('in')` and types `out` as `string`. Useful for filters, taps, and transforms that preserve their input.

### `z.resolved(source, configField)`

An output whose type is looked up from an external data source via a config field. The canonical use case is spark subscribers:

```ts
outputs: {
  payload: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
},
config: z.object({
  sparkType: z.sparkType('Spark to listen for'),
})
```

The editor:

1. Reads `config.sparkType` (e.g. `"timer:timer-started"`).
2. Looks up the spark in the hub's registered sparks.
3. Uses the spark's schema as the output's type.

### `z.expression()`

A code editor in the config panel. The runtime value is a JavaScript expression as a string. Useful for "let the user write a filter."

### `z.color()`

A colour picker. Returns a hex/rgb/hsl string.

### `z.duration(default?, label?)`

A duration input with a unit selector (ms, s, min, h). Returns a number of milliseconds.

```ts
config: z.object({
  delay: z.duration(1000, 'Delay'),
})
```

### `z.sparkType(label?)`

A spark picker dropdown. Returns the full spark identifier (e.g. `"timer:timer-started"`). Pair with `z.resolved('spark', '<fieldName>')` on the output for type-aware connections.

### `z.code(language?)`

A multi-line code editor with syntax highlighting. Returns a string.

```ts
config: z.object({
  script: z.code('javascript'),
})
```

### `z.secret()`

A password input. The hub stores the value in the [Secret Store](../architecture/secret-store.md) under a `__secret_<field>` key instead of plaintext in `brika.yml`.

### `z.filePath()`

A file picker — opens the hub's file browser scoped to the plugin's granted fs paths. Returns a string path.

### `z.url()`

A URL input with validation. Returns a string.

### `z.jsonSchema(schema)`

Escape hatch for cases where Zod is not flexible enough. The value is a raw JSON Schema object; the editor renders a generic form from it.

## Inferring types

The standard Zod inference works:

```ts
const Config = z.object({ name: z.string(), age: z.number() });
type Config = z.infer<typeof Config>;
// { name: string; age: number }
```

In a block setup function, the third `config` argument is `z.infer<typeof yourConfigSchema>` automatically.

## See also

* **[Reactive Blocks](reactive-blocks.md)** — using these in port and config schemas.
* **[Sparks](sparks.md)** — `z.sparkType` and `z.resolved('spark', …)`.
* **[Type System](../architecture/type-system.md)** — how schemas become serialisable type descriptors over IPC.
