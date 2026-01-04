# Quick Setup Checklist

Fast-track setup guide for the BRIKA schema infrastructure.

## 🚀 5-Minute Setup

### 1. npm Login (1 min)

```bash
npm login
```

### 2. Deploy Cloudflare Worker (2 min)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. **Workers & Pages** → **Create Application** → **Create Worker**
3. Name: `brika-schemas`
4. **Deploy** → **Edit Code**
5. Copy code from `apps/schema-cdn/worker.ts` and related files
6. **Save and Deploy**

### 3. Add Custom Domain (1 min)

1. Worker page → **Settings** → **Triggers**
2. **Add Custom Domain**: `schema.brika.dev`
3. **Add Custom Domain**

### 4. Publish First Version (1 min)

```bash
cd packages/schema
bun run publish
git push --follow-tags
```

### 5. Test (30 seconds)

```bash
curl https://schema.brika.dev/plugin.schema.json
```

Should return JSON schema ✅

---

## 📋 Detailed Checklist

Copy this to track your progress:

```markdown
## npm Setup
- [ ] npm account exists
- [ ] Run `npm login`
- [ ] Access to @brika org confirmed

## Cloudflare Setup  
- [ ] Account created
- [ ] Domain added (brika.dev)
- [ ] Worker created (brika-schemas)
- [ ] Worker code deployed
- [ ] Custom domain added (schema.brika.dev)
- [ ] DNS resolves: `nslookup schema.brika.dev`

## First Publish
- [ ] Build: `bun run build`
- [ ] Publish: `bun run publish`
- [ ] Push tags: `git push --follow-tags`

## Testing
- [ ] Test unpkg: `curl https://unpkg.com/@brika/schema/dist/plugin.schema.json`
- [ ] Test custom domain: `curl https://schema.brika.dev/plugin.schema.json`
- [ ] Test in IDE: Add $schema to package.json, check validation
- [ ] No errors in browser console

## Finalize
- [ ] Update all plugin package.json files
- [ ] Document in README
- [ ] Share URL with team
```

---

## 🆘 Quick Troubleshooting

### npm publish fails

```bash
# Check login
npm whoami

# Re-login
npm login

# Try with force
bun run publish --force
```

### Custom domain 404

```bash
# Check DNS
nslookup schema.brika.dev

# Test worker directly
curl https://brika-schemas.YOUR_ACCOUNT.workers.dev/plugin.schema.json

# Wait 1-2 mins for unpkg to index npm package
```

### IDE not validating

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

1. Check URL works: `curl https://schema.brika.dev/plugin.schema.json`
2. Reload IDE: Cmd/Ctrl + Shift + P → "Reload Window"

---

## 📚 Full Documentation

- **[INFRASTRUCTURE_SETUP.md](./INFRASTRUCTURE_SETUP.md)** - Complete setup guide
- **[packages/schema/README.md](./packages/schema/README.md)** - Package usage
- **[packages/schema/PUBLISHING.md](./packages/schema/PUBLISHING.md)** - Publishing workflow
- **[apps/schema-cdn/README.md](./apps/schema-cdn/README.md)** - Worker deployment

---

## ✨ After Setup

Your infrastructure will be:

- ✅ **Zero cost** - Free tier for everything
- ✅ **Automatic** - No manual steps after first publish
- ✅ **Global** - CDN serves from 800+ locations
- ✅ **Versioned** - npm handles all versioning
- ✅ **Reliable** - Cloudflare + npm uptime SLA

Just run `bun run publish` whenever you update schemas!

