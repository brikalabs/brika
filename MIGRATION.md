# Schema Migration Guide

## What Changed

### Old Structure (Removed ✗)

```
packages/shared/
├── brika-plugin.schema.json     ❌ Deleted
└── src/
    └── plugin-schema.ts          ❌ Deleted

schemas/                          ❌ Deleted (entire folder)
├── plugin.schema.json
├── README.md
└── ...
```

### New Structure (Active ✓)

```
packages/schema/                  ✅ NEW
├── src/
│   ├── plugin.ts                 ✅ Zod schema (source of truth)
│   ├── generate-schemas.ts       ✅ Build script
│   └── index.ts                  ✅ Exports
├── dist/
│   └── plugin.schema.json        ✅ Generated JSON Schema
└── scripts/
    └── publish.ts                ✅ Publish automation
```

## Why the Change?

| Before | After |
|--------|-------|
| ❌ Manual JSON Schema maintenance | ✅ Generated from Zod |
| ❌ Files in git | ✅ Published to npm |
| ❌ GitHub-based CDN | ✅ npm CDN (unpkg/jsdelivr) |
| ❌ No runtime validation | ✅ Zod + JSON Schema |
| ❌ No TypeScript types | ✅ Full type inference |

## Migration Steps

### For Plugin Developers

#### 1. Update $schema URL

**Before:**
```json
{
  "$schema": "https://raw.githubusercontent.com/maxscharwath/brika/master/packages/sdk/brika-plugin.schema.json"
}
```

**After:**
```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

**Or pinned version:**
```json
{
  "$schema": "https://schema.brika.dev/0.1.0/plugin.schema.json"
}
```

#### 2. Optional: Use Runtime Validation

Install the schema package:

```bash
bun add @brika/schema
```

Validate at runtime:

```typescript
import { validatePluginPackage } from "@brika/schema";

const result = validatePluginPackage(packageJson);
if (result.success) {
  // Valid plugin
  const plugin = result.data;
}
```

### For BRIKA Maintainers

#### 1. Update Schema

**Before:**
```bash
# Edit JSON Schema manually
vim packages/shared/brika-plugin.schema.json
git commit -am "Update schema"
git push
```

**After:**
```bash
# Edit Zod schema
vim packages/schema/src/plugin.ts

# Bump version and publish
cd packages/schema
npm version patch
bun run publish
git push --follow-tags
```

#### 2. Hub Integration

Use runtime validation in plugin manager:

```typescript
// apps/hub/src/runtime/plugins/plugin-manager.ts
import { validatePluginPackage } from "@brika/schema";

async loadPlugin(packageJson: unknown) {
  const result = validatePluginPackage(packageJson);
  
  if (!result.success) {
    throw new Error(`Invalid plugin package.json: ${result.error}`);
  }
  
  // Use validated data
  const plugin = result.data;
}
```

## Updated Plugin References

All existing plugins have been updated:

- ✅ `plugins/timer/package.json`
- ✅ `plugins/example-echo/package.json`
- ✅ `plugins/blocks-builtin/package.json`

New URL:
```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

## Breaking Changes

### Removed Exports

**From `@brika/shared`:**

```typescript
// ❌ No longer available
import schema from "@brika/shared/plugin-schema.json";
```

**Use instead:**

```typescript
// ✅ Runtime validation
import { validatePluginPackage, PluginPackageSchema } from "@brika/schema";

// ✅ JSON Schema (for IDE)
// Just use $schema URL in package.json
```

### Schema Location

**Old URLs (deprecated):**
```
❌ https://raw.githubusercontent.com/.../brika-plugin.schema.json
❌ file:///.../packages/shared/brika-plugin.schema.json
```

**New URLs (use these):**
```
✅ https://schema.brika.dev/plugin.schema.json (latest)
✅ https://schema.brika.dev/0.1.0/plugin.schema.json (pinned)
```

## Benefits of Migration

### For Plugin Developers

✅ **Stable URL** - Won't change with repo structure  
✅ **Faster** - CDN vs raw GitHub  
✅ **Versioned** - Pin to specific version  
✅ **Always available** - npm uptime > GitHub  

### For BRIKA Maintainers

✅ **Single source** - Zod schema generates JSON  
✅ **Type-safe** - TypeScript types from Zod  
✅ **Runtime validation** - Same schema in code & IDE  
✅ **Automatic** - Publish once, available everywhere  

## Rollback Plan

If issues arise, you can temporarily use direct npm CDN:

```json
{
  "$schema": "https://unpkg.com/@brika/schema@0.1.0/dist/plugin.schema.json"
}
```

Or jsDelivr:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@brika/schema@0.1.0/dist/plugin.schema.json"
}
```

## Testing After Migration

### 1. Check Schema URL

```bash
curl https://schema.brika.dev/plugin.schema.json
# Should return valid JSON Schema
```

### 2. Test IDE Validation

1. Open plugin `package.json`
2. Try adding invalid field
3. Should see error from IDE

### 3. Test Runtime Validation

```typescript
import { validatePluginPackage } from "@brika/schema";

const result = validatePluginPackage({
  name: "invalid-name",  // Not scoped
  version: "1.0.0",
});

console.log(result.success); // false
console.log(result.error);   // Validation errors
```

## Support

### Issues with Migration?

1. **Schema not loading:** Clear IDE cache (Reload Window)
2. **404 errors:** Wait 1-2 minutes after publishing
3. **Validation not working:** Check $schema URL is correct

### Questions?

- See [INFRASTRUCTURE_SETUP.md](./INFRASTRUCTURE_SETUP.md) for setup
- See [packages/schema/README.md](./packages/schema/README.md) for usage
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for how it works

---

## Summary

✅ **Cleaned up:**
- Removed `packages/shared/brika-plugin.schema.json`
- Removed `packages/shared/src/plugin-schema.ts`
- Removed `/schemas/` folder

✅ **Replaced with:**
- `packages/schema/` - New dedicated package
- Published to npm as `@brika/schema`
- Served via `schema.brika.dev`

✅ **Updated:**
- All plugin package.json files
- Schema URLs point to custom domain
- Ready for npm publishing

**Status:** Migration complete! 🎉

