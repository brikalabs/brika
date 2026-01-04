# Publishing @brika/schema

## npm Registry Approach

Schemas are published to npm registry and served via unpkg/jsdelivr CDN automatically.

## Why npm Registry?

✅ **No files in git** - Generated schemas don't clutter the repo  
✅ **Automatic versioning** - npm version = schema version  
✅ **Free CDN** - unpkg/jsdelivr serve npm packages automatically  
✅ **Immutable versions** - Once published, versions can't change  
✅ **Simple workflow** - Just `npm publish`  

## Architecture

```
┌──────────────┐
│  Zod Schema  │  (Source of truth)
└──────┬───────┘
       │
       ├─ bun run build
       v
┌──────────────┐
│  JSON Schema │  (Generated → dist/)
└──────┬───────┘
       │
       ├─ npm publish
       v
┌──────────────┐
│ npm Registry │
└──────┬───────┘
       │
       ├─ Auto-served by unpkg/jsdelivr
       v
┌──────────────┐
│ Cloudflare   │  (Proxy with custom domain)
│    Worker    │
└──────┬───────┘
       │
       v
┌──────────────┐
│  Developers  │  (schema.brika.dev)
└──────────────┘
```

## Publishing Workflow

### 1. Update Schema

Edit `src/plugin.ts`:

```typescript
export const PluginPackageSchema = z.object({
  // Add/modify fields here
  newField: z.string().optional(),
});
```

### 2. Bump Version

```bash
cd packages/schema

# Patch release (0.1.0 → 0.1.1)
npm version patch

# Minor release (0.1.0 → 0.2.0)
npm version minor

# Major release (0.1.0 → 1.0.0)
npm version major
```

This automatically:
- Updates `package.json` version
- Creates git commit
- Creates git tag

### 3. Build

```bash
bun run build
```

Generates `dist/plugin.schema.json` with injected version.

### 4. Publish

```bash
npm publish --access public
```

Schema is now available at:
- `https://unpkg.com/@brika/schema@0.1.0/dist/plugin.schema.json`
- `https://cdn.jsdelivr.net/npm/@brika/schema@0.1.0/dist/plugin.schema.json`

### 5. Push Git Tags

```bash
git push --follow-tags
```

## URL Patterns

After publishing, schemas are accessible at:

### Direct (npm CDN)

```
# Latest version
https://unpkg.com/@brika/schema/dist/plugin.schema.json
https://cdn.jsdelivr.net/npm/@brika/schema/dist/plugin.schema.json

# Specific version
https://unpkg.com/@brika/schema@0.1.0/dist/plugin.schema.json
https://cdn.jsdelivr.net/npm/@brika/schema@0.1.0/dist/plugin.schema.json
```

### Custom Domain (via Cloudflare Worker)

```
# Latest version
https://schema.brika.dev/plugin.schema.json

# Specific version
https://schema.brika.dev/0.1.0/plugin.schema.json
```

## Automation (Optional)

### GitHub Action for Auto-Publishing

Create `.github/workflows/publish-schema.yml`:

```yaml
name: Publish Schema Package

on:
  push:
    paths:
      - 'packages/schema/**'
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Build schemas
        run: cd packages/schema && bun run build
      
      - name: Check if version changed
        id: version
        run: |
          cd packages/schema
          VERSION=$(jq -r .version package.json)
          if npm view @brika/schema@$VERSION > /dev/null 2>&1; then
            echo "exists=true" >> $GITHUB_OUTPUT
          else
            echo "exists=false" >> $GITHUB_OUTPUT
          fi
      
      - name: Publish to npm
        if: steps.version.outputs.exists == 'false'
        run: |
          cd packages/schema
          echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
          npm publish --access public
```

Requires adding `NPM_TOKEN` to GitHub secrets.

## Versioning Strategy

### Semantic Versioning

- **Patch** (0.1.0 → 0.1.1): Bug fixes, clarifications
- **Minor** (0.1.0 → 0.2.0): New optional fields
- **Major** (0.1.0 → 1.0.0): Breaking changes (required fields, removed fields)

### When to Bump

| Change | Version Bump |
|--------|--------------|
| Add optional field | Minor |
| Add required field | Major |
| Remove field | Major |
| Change validation | Major |
| Fix typo in description | Patch |
| Add examples | Patch |

## Testing Before Publishing

### 1. Build Locally

```bash
bun run build
```

### 2. Check Generated Schema

```bash
cat dist/plugin.schema.json | jq .
```

### 3. Test with Local Plugin

```bash
# In a plugin directory
npm link ../packages/schema
```

Update plugin's `package.json`:

```json
{
  "$schema": "file:../packages/schema/dist/plugin.schema.json"
}
```

Check IDE validation works.

### 4. Dry Run Publish

```bash
npm publish --dry-run
```

Shows what files would be published without actually publishing.

## Rollback

If you publish a bad version:

### Option 1: Deprecate

```bash
npm deprecate @brika/schema@0.1.1 "This version has issues, use 0.1.2 instead"
```

### Option 2: Unpublish (within 72 hours)

```bash
npm unpublish @brika/schema@0.1.1
```

**Warning:** Unpublishing can break dependents. Prefer deprecation.

### Option 3: Publish Fix

```bash
npm version patch
bun run build
npm publish
```

## Monitoring

### Check Published Versions

```bash
npm view @brika/schema versions
```

### Check Download Stats

```bash
npm view @brika/schema
```

### Check CDN Availability

```bash
curl -I https://unpkg.com/@brika/schema/dist/plugin.schema.json
curl -I https://schema.brika.dev/plugin.schema.json
```

## Benefits vs Git-Based Approach

| Aspect | Git-Based (Before) | npm Registry (After) |
|--------|-------------------|---------------------|
| **Files in repo** | ❌ Generated files committed | ✅ Only source files |
| **Versioning** | ⚠️ Manual git tags | ✅ Automatic npm versioning |
| **CDN** | jsDelivr (GitHub) | unpkg/jsdelivr (npm) |
| **Immutability** | ⚠️ Can force push | ✅ npm versions immutable |
| **Discovery** | GitHub only | ✅ npm search, badges |
| **Dependencies** | ❌ Can't depend on schema | ✅ Can install via npm |

## Checklist

Before publishing:

- [ ] Update Zod schema in `src/plugin.ts`
- [ ] Bump version with `npm version`
- [ ] Run `bun run build`
- [ ] Test generated schema locally
- [ ] Check `dist/` directory exists and has schema
- [ ] Run `npm publish --dry-run`
- [ ] Publish with `npm publish --access public`
- [ ] Push git tags with `git push --follow-tags`
- [ ] Test CDN URLs are accessible
- [ ] Update Cloudflare Worker if needed

## FAQ

### Why npm over GitHub?

npm provides:
- Proper package versioning
- Immutable published versions
- Better CDN integration
- Package management features

### Do we still need /schemas folder?

No! The npm package replaces it. You can remove `/schemas/` from the repo.

### What about the Cloudflare Worker?

Still useful for custom domain (`schema.brika.dev`), but now it proxies unpkg instead of GitHub.

### Can external plugins use this?

Yes! They can:
1. Install: `npm install @brika/schema`
2. Use runtime validation: `import { validatePluginPackage } from "@brika/schema"`
3. Reference schema: `"$schema": "https://schema.brika.dev/plugin.schema.json"`

---

**Next:** After publishing, update all plugin `package.json` files to use the new CDN URLs.

