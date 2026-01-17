# Brika Plugin Discovery

## How Brika Finds Plugins on npm

Brika uses a **dependency-based discovery** mechanism to find plugins on npm. This is more reliable than keyword-based search.

### Discovery Strategy

**Hybrid Approach (Most Reliable)**

Brika uses a two-step process:

1. **Broad Search** - Find all packages with the `brika` keyword:
   ```
   keywords:brika
   ```

2. **Backend Filtering** - Verify each package has `engines.brika` field

This approach is necessary because npm's dependency search doesn't work reliably with scoped packages like `@brika/sdk`.

**Why This Works:**

1. ✅ **Required Field** - Every Brika plugin MUST have `engines.brika` to declare compatibility
2. ✅ **Accurate** - The `engines.brika` field is specific to Brika plugins
3. ✅ **Complete** - Finds all plugins that follow the schema
4. ✅ **Reliable** - Works around npm search API limitations
5. ✅ **Fast** - Cached on backend, users get instant results

**The `brika` Keyword (Required)**
```json
{
  "keywords": ["brika"]
}
```

The `brika` keyword is **required** for discovery because:
- Enables initial broad search on npm
- Identifies packages as part of the Brika ecosystem
- Works reliably with npm's search API

**Additional Keywords (Recommended)**
```json
{
  "keywords": ["brika", "brika-plugin", "automation", "workflow"]
}
```

Adding specific keywords helps with:
- Better discoverability in npm search
- Categorization and filtering
- SEO and npm trending

## Example Search Query

When you search for "timer" in the Brika store:

**Step 1: npm Search**
```
keywords:brika timer
```

This finds all packages that:
1. Have the `brika` keyword (Brika ecosystem packages)
2. Match "timer" in name or description

**Step 2: Backend Filter**
```typescript
// Filter to only include packages with engines.brika
packages.filter(pkg => pkg.engines?.brika !== undefined)
```

This ensures only actual Brika plugins are shown (not SDK, utilities, etc.)

## For Plugin Developers

### Minimum Requirements

Your `package.json` must include:

```json
{
  "name": "@yourscope/your-plugin",
  "version": "1.0.0",
  "keywords": ["brika"],
  "dependencies": {
    "@brika/sdk": "^0.2.0"
  },
  "engines": {
    "brika": "^0.2.0"
  }
}
```

**Critical:**
- ✅ `keywords` must include `"brika"` - enables discovery
- ✅ `engines.brika` must be set - identifies as plugin
- ✅ `@brika/sdk` must be in dependencies - provides plugin APIs

### Recommended Setup

For best discoverability, also add:

```json
{
  "keywords": ["brika-plugin", "your-category"],
  "description": "Clear description of what your plugin does",
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

## Comparison with Other Approaches

### 1. Keyword-Only Search (Other Platforms)
```
keywords:brika-plugin
```

**Pros:**
- Simple to implement
- Standard npm practice

**Cons:**
- ❌ Authors might forget to add keyword
- ❌ Can be gamed (add keyword without actually being a plugin)
- ❌ Misses plugins that work but lack keywords

### 2. Dependency Search (Brika's Approach)
```
dependencies:@brika/sdk
```

**Pros:**
- ✅ Foolproof - you can't be a plugin without the SDK
- ✅ Complete - finds ALL plugins
- ✅ Accurate - no false positives
- ✅ Self-documenting - dependency graph shows it's a Brika plugin

**Cons:**
- None significant

### 3. Centralized Registry (Alternative)
Maintain a separate database of plugins

**Pros:**
- Full control over listings
- Can add extra metadata

**Cons:**
- ❌ Requires hosting and maintenance
- ❌ Manual submission process
- ❌ Can become out of sync with npm
- ❌ Storage costs
- ❌ Extra complexity

## npm Search API

The npm registry search API supports dependency-based queries:

```
GET https://registry.npmjs.org/-/v1/search?text=dependencies:@brika/sdk
```

Response includes:
- Package metadata
- Popularity score
- Quality metrics
- Maintenance score

## Benefits for Users

1. **Discover More Plugins** - Even those without proper keywords
2. **Trust** - If it depends on `@brika/sdk`, it's a real plugin
3. **Up-to-date** - Always synced with npm, no manual registry
4. **Fast** - npm's CDN handles the search infrastructure

## Benefits for Developers

1. **Zero Friction** - Just publish to npm, no extra registration
2. **Standard Workflow** - Use existing npm publish process
3. **Automatic Discovery** - Plugin appears in store immediately
4. **No Lock-in** - Your package lives on npm, not tied to Brika's infrastructure

## Verification Layer

While discovery is automatic via dependencies, **verification** is manual and provides:

- ✅ Security review
- ✅ Quality assurance
- ✅ Compatibility testing
- ✅ Featured placement

Verified plugins get a special badge in the store, but unverified plugins are still discoverable and installable.

## Implementation Details

### Backend (Hub)

```typescript
// apps/hub/src/runtime/services/npm-search.ts
const searchTerms = ['dependencies:@brika/sdk'];
if (query) {
  searchTerms.push(query);
}
const searchQuery = searchTerms.join(' ');
```

### Validation (CI)

```yaml
# .github/workflows/verify-plugins.yml
- name: Verify @brika/sdk dependency
  run: |
    DEPS=$(npm view "$plugin" dependencies --json)
    if echo "$DEPS" | grep -q "@brika/sdk"; then
      echo "✅ Valid plugin"
    fi
```

## Future Enhancements

1. **Peer Dependencies** - Also search `peerDependencies:@brika/sdk`
2. **Version Filtering** - Filter by SDK version compatibility
3. **Trending** - Sort by recent download growth
4. **Collections** - Curated sets of plugins for specific use cases

## See Also

- [Verified Plugins Contributing Guide](./VERIFIED_PLUGINS_CONTRIBUTING.md)
- [npm Search API Documentation](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [Brika Plugin Schema](https://schema.brika.dev/plugin.schema.json)
