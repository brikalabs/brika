# @brika/schema - npm Registry Approach

## ✅ Implementation Complete!

A unified schema package that uses **npm registry** instead of git for schema distribution.

## What Was Created

### Package Structure

```
packages/schema/
├── package.json              # npm package config
├── src/
│   ├── index.ts             # Public exports
│   ├── plugin.ts            # Zod schema (source of truth)
│   └── generate-schemas.ts  # Build script (Zod → JSON)
├── dist/
│   └── plugin.schema.json   # Generated (published to npm)
├── README.md                # Usage documentation
└── PUBLISHING.md            # Publishing guide
```

## Key Benefits

### ✅ Single Source of Truth
```typescript
// Define once in Zod
export const PluginPackageSchema = z.object({
  name: z.string(),
  // ...
});
```

Automatically get:
- Runtime validation (TypeScript)
- JSON Schema (IDE validation)
- Type definitions

### ✅ npm Registry as CDN

**No files in git!** Schemas live in npm:

```
npm publish @brika/schema
  ↓
npm registry
  ↓  
unpkg/jsdelivr CDN (automatic)
  ↓
schema.brika.dev (custom domain)
  ↓
Developers
```

### ✅ Automatic Version Injection

```bash
# packages/schema/package.json
{ "version": "0.1.0" }
```

↓

```json
// Generated schema
{ "$id": "https://schema.brika.dev/0.1.0/plugin.schema.json" }
```

### ✅ Bun-Only APIs

Uses native Bun APIs:
- `Bun.file()` - Read files
- `await file.json()` - Parse JSON
- `Bun.write()` - Write files

No Node.js dependencies!

## Workflow

### 1. Update Schema (Zod)

```typescript
// packages/schema/src/plugin.ts
export const PluginPackageSchema = z.object({
  newField: z.string().optional(),
});
```

### 2. Build & Publish

```bash
cd packages/schema
npm version patch       # 0.1.0 → 0.1.1
bun run build          # Generate JSON Schema
npm publish --access public
```

### 3. Available Instantly

```
https://unpkg.com/@brika/schema@0.1.1/dist/plugin.schema.json
https://schema.brika.dev/0.1.1/plugin.schema.json
```

## URLs

### Latest Version

```
https://schema.brika.dev/plugin.schema.json
```

### Specific Version

```
https://schema.brika.dev/0.1.0/plugin.schema.json
```

### Direct from npm CDN

```
https://unpkg.com/@brika/schema@0.1.0/dist/plugin.schema.json
https://cdn.jsdelivr.net/npm/@brika/schema@0.1.0/dist/plugin.schema.json
```

## Usage

### Runtime Validation (Hub)

```typescript
import { validatePluginPackage } from "@brika/schema";

const result = validatePluginPackage(packageJson);
if (result.success) {
  // Valid plugin
  const plugin = result.data;
}
```

### IDE Validation (Plugins)

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@myorg/my-plugin"
}
```

### Type Safety

```typescript
import type { PluginPackage } from "@brika/schema";

const plugin: PluginPackage = {
  name: "@myorg/plugin",
  version: "1.0.0",
  engines: { brika: "^0.1.0" }
};
```

## Cloudflare Worker Update

Now proxies from npm instead of GitHub:

```javascript
// Proxies: unpkg.com/@brika/schema@{version}/dist/plugin.schema.json
// To: schema.brika.dev/{version}/plugin.schema.json
```

## Benefits vs Git Approach

| Feature | Git (Old) | npm (New) |
|---------|-----------|-----------|
| Generated files | ❌ Committed to git | ✅ Published to npm |
| Versioning | ⚠️ Manual git tags | ✅ npm semver |
| CDN | jsDelivr (GitHub) | unpkg/jsdelivr (npm) |
| Immutability | ⚠️ Can force push | ✅ npm immutable |
| Dependencies | ❌ Can't install | ✅ `npm install @brika/schema` |
| Type safety | ❌ No types | ✅ Full TypeScript support |

## What to Remove

You can now **delete** the `/schemas` folder from the repo root!

```bash
rm -rf /Users/maxsch/projects/brika/schemas
```

Schemas are now served from npm, not git.

## Next Steps

### 1. Test Locally

```bash
cd packages/schema
bun run build
cat dist/plugin.schema.json
```

### 2. Publish to npm

```bash
npm publish --access public
```

(Requires npm account and `@brika` org access)

### 3. Update Cloudflare Worker

Deploy updated `worker.js` to Cloudflare (already done in code).

### 4. Update Plugin References

All plugins already reference `schema.brika.dev`, no changes needed!

### 5. Test End-to-End

```bash
# After publishing
curl https://unpkg.com/@brika/schema/dist/plugin.schema.json
curl https://schema.brika.dev/plugin.schema.json
```

## Documentation

- **[README.md](./README.md)** - Package usage and API
- **[PUBLISHING.md](./PUBLISHING.md)** - Publishing workflow and automation
- **[src/plugin.ts](./src/plugin.ts)** - Zod schema definitions

## Technical Details

### Zod 4 Native JSON Schema

Uses built-in `z.toJSONSchema()`:

```typescript
const jsonSchema = z.toJSONSchema(PluginPackageSchema, {
  target: "draft-07",
  metadata: z.globalRegistry,
});
```

No external dependencies like `zod-to-json-schema`.

### prepublishOnly Hook

```json
{
  "scripts": {
    "prepublishOnly": "bun run build"
  }
}
```

Automatically builds schemas before publishing.

### files Field

```json
{
  "files": ["dist", "src"]
}
```

Only publishes necessary files to npm.

## Future Enhancements

### Additional Schemas

```
packages/schema/src/
├── plugin.ts         # ✅ Done
├── config.ts         # 🔜 For brika.yml
├── automation.ts     # 🔜 For workflow files
└── block.ts          # 🔜 For block definitions
```

All following the same pattern!

### GitHub Action

Auto-publish on version bump:

```yaml
name: Publish Schema
on:
  push:
    paths: ['packages/schema/package.json']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: npm publish
```

---

**Status:** ✅ Ready to publish!  
**Next:** Run `npm publish --access public` in `packages/schema/`

