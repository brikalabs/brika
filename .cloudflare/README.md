# Cloudflare Worker for BRIKA Schemas

This Cloudflare Worker proxies schema requests from `schema.brika.dev` to jsDelivr CDN.

## Deployment Instructions

### 1. Login to Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**

### 2. Create Worker

1. Click **Create Application** → **Create Worker**
2. Name it: `brika-schemas`
3. Click **Deploy**
4. Click **Edit Code**
5. Copy the contents of `worker.js` from this folder
6. Paste into the worker editor
7. Click **Save and Deploy**

### 3. Add Custom Domain

1. Go to the worker settings
2. Navigate to **Triggers** tab
3. Click **Add Custom Domain**
4. Enter: `schema.brika.dev`
5. Click **Add Custom Domain**

### 4. Configure DNS

If your domain is already on Cloudflare:
- DNS record will be automatically created

If your domain is NOT on Cloudflare:
1. Go to your domain registrar
2. Change nameservers to Cloudflare's nameservers
3. Wait for DNS propagation (can take up to 48 hours)

Alternatively, you can manually add a CNAME record:
- Type: CNAME
- Name: `schema`
- Target: `brika-schemas.{your-account}.workers.dev`

### 5. Verify Deployment

Test the worker with curl:

```bash
# Test latest schema
curl https://schema.brika.dev/plugin.schema.json

# Test specific version (after tagging)
curl https://schema.brika.dev/0.1.0/plugin.schema.json

# Test explicit main
curl https://schema.brika.dev/main/plugin.schema.json
```

## How It Works

The worker:
1. Receives requests to `schema.brika.dev`
2. Parses the version from the URL path
3. Proxies to jsDelivr: `cdn.jsdelivr.net/gh/maxscharwath/brika@{version}/schemas/{file}`
4. Adds CORS headers for browser access
5. Returns the schema

## URL Patterns

| Request | Proxies To |
|---------|------------|
| `/plugin.schema.json` | `cdn.jsdelivr.net/gh/maxscharwath/brika@main/schemas/plugin.schema.json` |
| `/0.1.0/plugin.schema.json` | `cdn.jsdelivr.net/gh/maxscharwath/brika@v0.1.0/schemas/plugin.schema.json` |
| `/main/plugin.schema.json` | `cdn.jsdelivr.net/gh/maxscharwath/brika@main/schemas/plugin.schema.json` |
| `/latest/plugin.schema.json` | Redirects to `/main/plugin.schema.json` |

## Cost

Free tier includes:
- 100,000 requests per day
- Unlimited bandwidth
- Global edge network

For schema hosting, you'll use < 1% of the free quota.

