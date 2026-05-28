# Type System

Brika's blocks have typed input and output ports. The types are declared with Zod, but they have to:

1. Travel over IPC from the plugin process to the hub.
2. Reach the UI so the workflow editor can render type info and refuse incompatible connections.
3. Support BRIKA-specific schemas like `z.generic()`, `z.passthrough(srcPortId)`, and `z.resolved(source, field)` that go beyond standard Zod.

The bridge between Zod and a JSON-serialisable shape the UI can reason about is `@brika/type-system`.

Key files:

* `packages/type-system/src/descriptor.ts` — `TypeDescriptor` union.
* `packages/type-system/src/from-zod.ts` — `fromZod(schema)` conversion.
* `packages/type-system/src/compatibility.ts` — `isCompatible(source, target)`.
* `packages/type-system/src/autocomplete.ts` — autocomplete helpers for the editor.

## `TypeDescriptor`

A discriminated union covering every type the editor needs to know about:

```ts
type TypeDescriptor =
  | { kind: 'primitive'; primitive: 'string' | 'number' | 'boolean' | 'null' | 'integer' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'object'; properties: Record<string, TypeDescriptor>; required?: string[] }
  | { kind: 'array'; items: TypeDescriptor }
  | { kind: 'tuple'; items: TypeDescriptor[] }
  | { kind: 'union'; members: TypeDescriptor[] }
  | { kind: 'record'; values: TypeDescriptor }
  | { kind: 'enum'; values: Array<string | number> }
  | { kind: 'any' }
  | { kind: 'unknown' }
  | { kind: 'generic'; typeVar?: string }
  | { kind: 'passthrough'; sourcePortId: string }
  | { kind: 'resolved'; source: string; configField: string }
```

The shape is intentionally close to JSON Schema but adds the BRIKA-specific kinds (`generic`, `passthrough`, `resolved`) that JSON Schema can't express. It is purely structural — no methods, no references — so it round-trips through JSON cleanly.

## The pipeline

```
Zod schema
   │
   ▼ fromZod(schema)
TypeDescriptor
   │
   ▼ JSON.stringify
JSON
   │
   ▼ IPC message (BlockPort.type)
Hub stores it on the block definition
   │
   ▼ REST (`GET /api/blocks`)
JSON
   │
   ▼ UI receives, reads .type
Type-aware editor rendering + compatibility checks
```

`fromZod` walks the Zod schema, mapping nodes to descriptors. It handles:

* All primitive types and Zod literal/enum forms.
* `z.object`, `z.array`, `z.tuple`, `z.record`, `z.union`, `z.discriminatedUnion`.
* `z.optional` / `z.nullable` — promoted to union with `null`.
* The custom BRIKA types via marker properties (`__type: 'generic' | 'passthrough' | 'resolved'`).

What it does not handle: `z.lazy` (recursive types), `z.function`, `z.promise`. These rarely show up in port schemas and would not survive JSON round-trip.

## Compatibility

`isCompatible(source, target)` is the rule the editor uses when the user drags a connection between ports.

Core rules:

* Same primitive → ok.
* `target.kind === 'generic'` → ok (generic accepts anything).
* `source.kind === 'generic'` → ok (generic flows into anything).
* Object → object: every required property in `target` must exist in `source` and be compatible.
* Array → array: items compatible.
* Tuple → tuple: same length, items compatible pairwise.
* Union: `source` is compatible with `target` if **every** member of `source` is compatible with **some** member of `target`.
* `passthrough` types resolve to the type of their source port; the editor walks the graph to find it.
* `resolved` types resolve via the external data source; spark schemas are the canonical example.

Incompatible connections are refused at editor time — the user sees a red drop indicator and a hint about the mismatch.

## Special-type round-tripping

The custom types are detected by marker properties on the Zod schema. `z.generic()` returns a schema object with `__type: 'generic'`. `fromZod` checks for these markers before falling back to standard Zod inspection.

Markers are also used by the schema → JSON Schema converter so the JSON Schema doesn't claim a phantom literal type — the converter emits `{}` (any) for generic and passthrough, and `{}` for resolved with a custom hint.

## Why not just JSON Schema?

JSON Schema lacks:

* A way to say "the type of this output equals the type of input X" (passthrough).
* A way to say "the type is looked up at edit time from another data source" (resolved).
* A clean way to say "anything, treat as type variable" (generic) — `{}` works but the editor would need extra hints.

`TypeDescriptor` extends JSON Schema's vocabulary just enough to cover BRIKA's needs while staying JSON-serialisable.

## Where the JSON Schema does show up

For input validation in config schemas (block config, brick config, preferences), the SDK uses Zod's built-in `z.toJSONSchema(schema)` to emit standard JSON Schema. The editor uses that schema to drive form rendering — text fields, dropdowns, checkboxes — the form-rendering layer doesn't need BRIKA-specific extensions there.

## See also

* **[Schema Types](../plugins/schema-types.md)** — author-facing `z` reference.
* **[Reactive Blocks](../plugins/reactive-blocks.md)** — port schemas in context.
* **[IPC Protocol](ipc-protocol.md)** — how the descriptor reaches the hub.
* **[Schema Generation](schema-generation.md)** — the JSON Schema pipeline for the plugin manifest.
