# Publishing Scripts

## publish.ts

Automated publishing script for @brika/schema with safety checks.

### Usage

```bash
# Normal publish (checks if version exists)
bun run publish

# Force publish (override version check)
bun run publish --force

# Dry run (see what would be published)
bun run publish --dry-run
```

### What It Does

1. **Builds** - Runs `bun run build` to generate JSON schemas
2. **Checks** - Verifies version doesn't exist on npm (unless --force)
3. **Publishes** - Runs `npm publish --access public`
4. **Shows URLs** - Displays CDN URLs where schema is available

### Flags

#### `--force`

Skip version existence check and force publish.

**Use cases:**
- Development/testing (republish same version)
- Fix broken publish
- Override after unpublish

**Warning:** npm discourages overriding published versions. Use sparingly!

```bash
bun run publish --force
```

#### `--dry-run`

Show what would be published without actually publishing.

**Use cases:**
- Check package contents
- Verify build output
- Test before real publish

```bash
bun run publish --dry-run
```

### Workflow Examples

#### Publishing a New Version

```bash
# 1. Make changes to src/plugin.ts
vim src/plugin.ts

# 2. Bump version (creates commit + tag)
npm version patch   # 0.1.0 → 0.1.1

# 3. Publish (builds automatically)
bun run publish

# 4. Push tags
git push --follow-tags
```

#### Force Republish (Development)

```bash
# During development, you might want to republish without version bump
bun run publish --force

# Or unpublish first, then republish
npm unpublish @brika/schema@0.1.0
bun run publish
```

#### Check Before Publishing

```bash
# See what files will be published
bun run publish --dry-run

# Review the output, then publish for real
bun run publish
```

### Error Handling

#### Version Already Exists

```
❌ Version 0.1.0 already exists on npm!

Options:
  1. Bump version: npm version patch|minor|major
  2. Force publish: bun run publish --force
  3. Unpublish first: npm unpublish @brika/schema@0.1.0
```

#### Build Failed

```
❌ Build failed!
```

Check `src/plugin.ts` for Zod schema errors.

#### Publish Failed

```
❌ Publish failed!
```

Common causes:
- Not logged in: `npm login`
- No permissions: Request access to @brika org
- Network issues: Check connection

### npm Commands vs. Script

| Task | npm Command | Bun Script |
|------|-------------|------------|
| Build | `bun run build` | Included in publish script |
| Check version | `npm view @brika/schema@x.y.z` | Automatic check |
| Publish | `npm publish --access public` | `bun run publish` |
| Force publish | `npm publish --force` | `bun run publish --force` |
| Dry run | `npm publish --dry-run` | `bun run publish --dry-run` |

### Best Practices

#### ✅ Do

- Use `bun run publish` for normal publishes
- Use `--dry-run` to check before publishing
- Bump version with `npm version patch/minor/major`
- Push tags after publishing: `git push --follow-tags`

#### ⚠️ Use Sparingly

- `--force` flag - only for development/fixes
- Unpublishing - only within 72 hours, breaks dependents

#### ❌ Don't

- Force publish to production versions
- Publish without bumping version
- Skip the version check in production

### Integration with package.json

```json
{
  "scripts": {
    "build": "bun run src/generate-schemas.ts",
    "publish": "bun run scripts/publish.ts",
    "prepublishOnly": "bun run build"
  }
}
```

- `prepublishOnly` - Runs before `npm publish` (safety net)
- `version` - Runs after `npm version` (updates dist/)
- `publish` - Our custom script (with checks)

### Troubleshooting

#### "command not found: npm"

Install npm or use with npx:
```bash
npx npm publish
```

#### "need auth"

Login to npm:
```bash
npm login
```

#### "403 Forbidden"

Request access to @brika organization on npm.

#### "ERR! 404 Not Found"

Package name might be taken or org doesn't exist. Check:
```bash
npm view @brika/schema
```

---

**See Also:**
- [PUBLISHING.md](../PUBLISHING.md) - Complete publishing guide
- [package.json](../package.json) - Scripts configuration

