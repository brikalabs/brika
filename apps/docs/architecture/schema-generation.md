# Schema Generation

The plugin manifest (`package.json` extended with `blocks`, `bricks`, etc.) is validated against a Zod schema at the hub and against a JSON Schema at editor-time and on the CDN. Both schemas come from the same source: `@brika/schema/plugin`.

Key files:

* `packages/schema/src/plugin.ts` — the Zod schema.
* `packages/schema/src/generate-schemas.ts` — CLI that emits the JSON Schema.
* Distributed: `https://schema.brika.dev/<version>/plugin.schema.json`.

## The pipeline

```
packages/schema/src/plugin.ts
       │
       ▼ (build time) generate-schemas.ts
{ $schema, $id, type: 'object', properties: {…} }   ← draft-07 JSON Schema
       │
       ▼ npm publish
package: @brika/schema
       │
       ▼ deployed to CDN
https://schema.brika.dev/<version>/plugin.schema.json
```

Plugin authors point their `package.json` at the schema URL:

```json
"$schema": "https://schema.brika.dev/plugin.schema.json"
```

Editors with JSON Schema support (VS Code, JetBrains) then provide autocomplete and validation as they edit the manifest.

## The Zod source

```ts
import { z } from 'zod';

export const PluginPackageSchema = z.looseObject({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  // …standard package.json fields…
  engines: z.object({ brika: z.string() }).optional(),
  brika: z.object({
    sdk: z.string().optional(),
    hub: z.string().optional(),
    pages: z.array(PageManifest).optional(),
    bricks: z.array(BrickManifest).optional(),
    blocks: z.array(BlockManifest).optional(),
    sparks: z.array(SparkManifest).optional(),
    permissions: z.array(z.string()).optional(),
    i18n: z.object({ defaultLocale: z.string() }).optional(),
  }).optional(),
  // capability arrays also accepted at top level
  blocks: z.array(BlockManifest).optional(),
  bricks: z.array(BrickManifest).optional(),
  pages: z.array(PageManifest).optional(),
  sparks: z.array(SparkManifest).optional(),
  permissions: z.array(z.string()).optional(),
});
```

`z.looseObject` allows fields not listed in the schema (every package.json has plenty of those). The validation focuses on the BRIKA-specific fields plus a minimal subset of standard package.json fields.

## Generating the JSON Schema

`generate-schemas.ts`:

```ts
import { PluginPackageSchema } from './plugin';

const jsonSchema = z.toJSONSchema(PluginPackageSchema, { target: 'draft-7' });
const enriched = {
  ...jsonSchema,
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: `https://schema.brika.dev/${version}/plugin.schema.json`,
  title: 'Brika Plugin',
  description: 'Manifest schema for Brika plugins',
};
await Bun.write('dist/plugin.schema.json', JSON.stringify(enriched, null, 2));
```

Zod 4's `toJSONSchema` handles most cases. The result gets enriched with `$id`, `title`, `description`, and version info, then published to:

* `https://unpkg.com/@brika/schema/dist/plugin.schema.json`
* `https://cdn.jsdelivr.net/npm/@brika/schema/dist/plugin.schema.json`
* `https://schema.brika.dev/<version>/plugin.schema.json` (a Cloudflare Worker that resolves versions and caches).

The "rolling" alias `https://schema.brika.dev/plugin.schema.json` tracks the latest published version.

## Runtime validation

Inside the hub, when a plugin is loaded, the manifest goes through `PluginPackageSchema.safeParse(pkg)`. On failure:

* The plugin is marked `incompatible`.
* The error message lands in the log stream.
* **No runtime checks run** — `@brika/sdk` verify-checks gate on a successful schema parse. There's no point running content checks against a manifest that doesn't even match the schema.

This is also why the SDK's verify-checks receive a fully-typed `PluginPackageSchema` in their `CheckContext` — by the time they run, the schema is already validated.

## Where verify-checks fit

The CLI `brika-verify-plugin` (run from plugins as `prepublishOnly`) takes the same schema-then-checks approach:

1. `PluginPackageSchema.safeParse(pkg)` — fail fast on schema errors.
2. Run every registered check from `@brika/sdk/verify-checks` (main entry exists, engine compatibility, publish-files coverage, schema URL correctness, keywords).
3. Print errors and warnings; non-zero exit on any error.

See [Publishing](../plugins/publishing.md) for the author's view.

## Versioning the schema

The schema version is bumped whenever the manifest grammar changes. The CDN keeps every published version forever, so plugins pinning a specific schema version continue to validate against the right rules. The unversioned alias always points at the newest schema — useful for editor autocomplete but should not be used in CI where stability matters.

## See also

* **[Manifest Reference](../plugins/manifest.md)** — author-facing schema.
* **[Publishing](../plugins/publishing.md)** — `brika-verify-plugin`.
* **[Type System](type-system.md)** — separate but related pipeline (block port types).
