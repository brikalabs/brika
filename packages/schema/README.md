# @brika/schema

The BRIKA plugin CONTRACT package: the dependency-free leaf that authoring
(`@brika/sdk`), build (`@brika/compiler`), and runtime (`apps/hub`) all share.
Zod is the single source of truth; JSON Schema for IDE support is derived.

## Subpaths

| Subpath | Contents |
| --- | --- |
| `.` / `./plugin` | `PluginPackageSchema` + entity schemas (`BlockSchema`, `SparkSchema`, `BrickSchema`, `PageSchema`, `ActionSchema`, `ToolSchema`, `PreferenceSchema`) with inferred types, plus friendly config units (`BytesSchema`, `DurationSchema`) |
| `./collect` | Build-time collect contract + zod lowering (`zodToPreferences`, `parseBrickMeta`) used by `brika build` |
| `./collect-sink` | Zod-free collector sink the SDK's `define*` helpers write into |
| `./i18n-keys` | The i18n key model: manifest-implied keys, runtime-resolved prefixes, bundle helpers |
| `./browser-bridge` | `BRIDGE_GLOBALS` — import specifier → `globalThis.__brika.*` map |
| `./fs-runtime` | `BrikaFsRuntime`, the pinned `__brika_fs` contract |
| `./plugin.json` | Generated JSON Schema (served at `schema.brika.dev`) |

Architecture invariants (enforced by `src/architecture.test.ts`): the package
imports nothing from the workspace, and the modules the compiler bundles for
V8/Workers (`collect-sink`, `i18n-keys`, `browser-bridge`, `fs-runtime`) are
zod-free at runtime.

## Installation

Internal package. It is bundled into `@brika/sdk` and `@brika/compiler`
(devDependency closure) and is not published to npm on its own. The generated
JSON Schema is served separately over the CDN at `schema.brika.dev`.

## Usage

### Runtime Validation (TypeScript)

```typescript
import { PluginPackageSchema } from "@brika/schema";

const result = PluginPackageSchema.safeParse(packageData);
if (result.success) {
  console.log("Valid plugin:", result.data);
} else {
  console.error("Invalid plugin:", result.error.issues);
}
```

### IDE Validation (JSON Schema)

In your plugin's `package.json`:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@myorg/my-plugin",
  "version": "1.0.0",
  "engines": {
    "brika": "^0.1.0"
  }
}
```

Your IDE will automatically:
- Validate the structure
- Provide autocomplete
- Show inline documentation
- Catch errors as you type

## Architecture

```
┌─────────────────┐
│  plugin.ts      │  ← Source of truth (Zod)
│  (Zod Schema)   │
└────────┬────────┘
         │
         ├─── Runtime validation (TypeScript)
         │
         v
┌─────────────────┐
│ generate-       │
│ schemas.ts      │  ← Build script
└────────┬────────┘
         │
         │ Generates (z.toJSONSchema)
         v
┌─────────────────┐
│ plugin.schema   │  ← Generated JSON Schema
│ .json           │  
└────────┬────────┘
         │
         ├─── Published to /schemas/
         ├─── Served via CDN
         └─── IDE validation
```

## How It Works

### 1. Define Schema in Zod (Once)

```typescript
// packages/schema/src/plugin.ts
export const PluginPackageSchema = z.object({
  name: z.string().regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/),
  version: z.string().regex(semverPattern),
  engines: z.object({
    brika: z.string().regex(semverRangePattern),
  }),
  // ... more fields
});
```

### 2. Generate JSON Schema (Automatic)

```bash
bun run build
```

This:
1. Reads `package.json` version
2. Converts Zod → JSON Schema using native `z.toJSONSchema()`
3. Injects version into `$id`
4. Writes to `dist/plugin.schema.json`

### 3. Publish the JSON Schema to the CDN

The package itself is internal and never published to npm. Only the generated JSON Schema is published, served over the CDN at `schema.brika.dev` from the repo's `schemas/` directory:

```bash
# Generate the JSON Schema
bun run build

# Release the generated schema to the CDN
bun run release
```

The release script automatically:
- Builds the schemas
- Checks if the version already exists
- Publishes the JSON Schema to the CDN
- Shows CDN URLs

### 4. Use Everywhere

**Runtime (Hub):**
```typescript
import { validatePluginPackage } from "@brika/schema";
const result = validatePluginPackage(pluginPackageJson);
```

**IDE (Developers):**
```json
{
  "$schema": "https://schema.brika.dev/0.1.0/plugin.schema.json"
}
```

## Development Workflow

### Adding a New Field

1. **Update Zod schema** in `src/plugin.ts`:
   ```typescript
   export const PluginPackageSchema = z.object({
     // ... existing fields
     newField: z.string().optional().describe("New field description"),
   });
   ```

2. **Regenerate JSON Schema**:
   ```bash
   bun run build
   ```

3. **Commit both files**:
   - `src/plugin.ts` (source)
   - `../../schemas/plugin.schema.json` (generated)

4. **Push to GitHub** - Cloudflare Worker serves updated schema

### Watch Mode (Development)

```bash
bun run dev
```

Auto-regenerates JSON Schema on Zod changes.

## Benefits Over Manual Maintenance

### ❌ Before (Separate Files)

```
✗ Maintain Zod schema manually
✗ Maintain JSON Schema manually
✗ Keep them in sync manually
✗ Update version in multiple places
✗ Risk of drift
```

### ✅ After (Single Source)

```
✓ Maintain Zod schema only
✓ JSON Schema generated automatically
✓ Always in sync
✓ Version injected automatically
✓ No drift possible
```

## Version Management

The schema version comes from `package.json`:

```json
{
  "name": "@brika/schema",
  "version": "0.1.0"  ← This version
}
```

Gets injected into JSON Schema:

```json
{
  "$id": "https://schema.brika.dev/0.1.0/plugin.schema.json"
}
```

### Updating Version

1. Update `packages/schema/package.json` version
2. Run `bun run release`
3. Push tags: `git push --follow-tags`
4. GitHub Action creates git tag (if configured)
5. New version accessible at `schema.brika.dev/x.y.z/...`

Or use npm's built-in version command:

```bash
npm version patch   # 0.1.0 → 0.1.1
bun run release
git push --follow-tags
```

## Type Safety

Get TypeScript types from Zod:

```typescript
import type { PluginPackage } from "@brika/schema";

const plugin: PluginPackage = {
  name: "@myorg/plugin",
  version: "1.0.0",
  engines: {
    brika: "^0.1.0"
  }
};
```

## Validation Examples

### Valid Plugin

```typescript
import { validatePluginPackage } from "@brika/schema";

const valid = validatePluginPackage({
  name: "@myorg/awesome-plugin",
  version: "1.0.0",
  engines: {
    brika: "^0.1.0"
  },
  tools: [
    {
      id: "my-tool",
      description: "Does something cool",
      icon: "zap",
      color: "#3b82f6"
    }
  ]
});

console.log(valid.success); // true
```

### Invalid Plugin

```typescript
const invalid = validatePluginPackage({
  name: "not-scoped",  // ❌ Must be scoped (@org/name)
  version: "1.0",       // ❌ Not valid semver
});

console.log(invalid.success); // false
console.log(invalid.error);   // Zod error with details
```

## Integration Points

### Hub (Runtime)

```typescript
// apps/hub/src/runtime/plugins/plugin-manager.ts
import { validatePluginPackage } from "@brika/schema";

async loadPlugin(packageJson: unknown) {
  const result = validatePluginPackage(packageJson);
  
  if (!result.success) {
    throw new Error(`Invalid plugin: ${result.error}`);
  }
  
  // Use validated data
  const plugin = result.data;
}
```

### Plugins (Development)

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-timer",
  "dependencies": {
    "@brika/sdk": "workspace:*"
  }
}
```

### External Plugins (via @brika/sdk)

`@brika/schema` is internal and not installable on its own. External plugins depend on `@brika/sdk`, which bundles this package, and use its validation API:

```typescript
import { PluginPackageSchema } from "@brika/sdk";
// Validate your plugin programmatically
```

For IDE support, external plugins reference the JSON Schema over the CDN instead, with no install required:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Generate JSON Schema from Zod |
| `bun run dev` | Watch mode - regenerate on changes |
| `bun run release` | Publish the generated JSON Schema to the CDN |

## Files

| File | Purpose |
|------|---------|
| `src/plugin.ts` | **Source of truth** - Zod schema |
| `src/generate-schemas.ts` | Build script - Zod → JSON |
| `src/index.ts` | Public exports |
| `dist/plugin.schema.json` | Generated JSON Schema |
| `../../schemas/plugin.schema.json` | Published to CDN |

## Future Schemas

This package will grow to include:

- `config.ts` / `config.schema.json` - For `brika.yml`
- `automation.ts` / `automation.schema.json` - For workflow files
- `block.ts` / `block.schema.json` - For block definitions

All following the same pattern:
1. Define in Zod
2. Generate JSON Schema
3. Publish via CDN

## Related

- [Zod Documentation](https://zod.dev)
- [Zod JSON Schema](https://zod.dev/json-schema)
- [JSON Schema Specification](https://json-schema.org/)
- [schemas/README.md](../../schemas/README.md) - CDN publishing docs

## License

Same as main BRIKA project.

