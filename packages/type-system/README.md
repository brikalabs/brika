# @brika/type-system

Unified type system for Brika workflow ports — the shared vocabulary that lets plugins from different authors connect their inputs and outputs without ad-hoc adapters.

## What's a "port type"?

Every Block / Spark / Workflow node exposes typed ports. The type can be:

- A primitive: `number`, `string`, `boolean`
- A semantic primitive: `temperature.celsius`, `power.watts`, `color.rgb`
- A structured type: `{ kind: 'object', fields: { ... } }`
- A union: `{ kind: 'union', members: [...] }`

This package owns the **definitions** of those types, the **compatibility check** (`isCompatible`), the **serialization format**, and the **runtime guards** plugins use to validate values flowing through their ports.

## Quick start

```ts
import { isCompatible, parseTypeName, type TypeDescriptor } from '@brika/type-system';

const a: TypeDescriptor = parseTypeName('temperature.celsius');
const b: TypeDescriptor = parseTypeName('number');

isCompatible(a, b); // true: semantic types are compatible with their underlying primitive
isCompatible(b, a); // false: going the other way would lose units
```

## Design

- **Nominal where it matters, structural where it helps.** Semantic primitives are nominal (you can't pass watts to a port expecting volts), but composite shapes are structural.
- **Forward-compatible.** Unknown type kinds round-trip unchanged so a newer plugin can declare a port type the hub doesn't recognize yet without breaking the manifest.
- **One source of truth.** Every consumer — the hub, the workflow editor, the plugin SDK — re-exports from this package.

## Related

- [`@brika/plugin`](../plugin/) — uses `arePortTypesCompatible` for manifest validation.
- [`@brika/sdk`](../sdk/) — re-exports the `PortType` vocabulary for plugin authors.
- [Schema types reference](https://docs.brika.dev/api-reference/schema-types) — exhaustive list of built-in semantic primitives.
