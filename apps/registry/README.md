# Brika Plugin Registry

This directory contains the Brika verified plugins registry and the Cloudflare Worker that serves it.

## Contents

- `verified-plugins.json` - Curated list of verified Brika plugins
- `schema.json` - JSON schema for validation
- `worker.ts` - Cloudflare Worker entry point
- `src/` - Worker source code (routes, types, utils)
- `wrangler.toml` - Cloudflare Worker configuration

## Purpose

**Registry Data**: Maintains the official list of verified Brika plugins
**CDN Worker**: Serves the registry globally via `registry.brika.dev`

## Verified Plugins

Plugins in this registry have been verified by the Brika maintainers and are:
- **Safe**: Reviewed for security and stability
- **Compatible**: Tested with current Brika versions
- **Maintained**: Actively supported by their authors

## Adding a Plugin

To submit a plugin for verification:

1. Ensure your plugin has the `brika-plugin` keyword in package.json
2. Include an `engines.brika` field specifying compatible versions
3. Create a pull request adding your plugin to `verified-plugins.json`
4. Our team will review and approve if it meets our standards

## Development

### Local Worker Development

```bash
cd apps/registry
bun dev
```

The worker will start on `http://localhost:8787`.

### Testing

```bash
# Get verified plugins list
curl http://localhost:8787/verified-plugins.json

# Health check
curl http://localhost:8787/health
```

## Deployment

### Prerequisites

1. Cloudflare account (free tier works)
2. Wrangler CLI installed (or use `bunx wrangler`)

### Deploy to Cloudflare

```bash
cd apps/registry
bun deploy
```

This will deploy the worker to Cloudflare's global edge network.

### Configure Custom Domain

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Select your worker (`brika-registry`)
4. Go to **Triggers** tab
5. Click **Add Custom Domain**
6. Enter: `registry.brika.dev`
7. Click **Add Custom Domain**

## How It Works

**Development Mode**:
- Brika Hub reads `verified-plugins.json` directly from this directory
- Fast local development with no network requests

**Production Mode**:
- Cloudflare Worker bundles `verified-plugins.json` during deployment
- Brika Hub fetches from `https://registry.brika.dev/verified-plugins.json`
- Global CDN delivers the registry with <100ms latency worldwide

The worker:
1. Bundles `verified-plugins.json` during build
2. Receives requests to `registry.brika.dev`
3. Serves the bundled JSON with CORS headers
4. Caches responses for optimal performance

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Redirects to `/verified-plugins.json` |
| `/verified-plugins.json` | Returns the verified plugins list |
| `/health` | Health check endpoint |

## Examples

```bash
# Get verified plugins list (production)
curl https://registry.brika.dev/verified-plugins.json

# Health check
curl https://registry.brika.dev/health
```

## Updating the Registry

1. Edit `verified-plugins.json` in this directory
2. Commit your changes
3. Deploy: `cd apps/registry && bun deploy`

The updated registry will be live globally within seconds.

## Integration with Brika Hub

The Hub automatically uses the correct source:

```typescript
// In apps/hub/src/runtime/services/verified-plugins.ts
const REGISTRY_URL = process.env.BRIKA_REGISTRY || 'https://registry.brika.dev';
const USE_LOCAL_FILE = process.env.NODE_ENV === 'development';
```

In development: reads local file
In production: fetches from CDN

## Benefits

- **Zero Cost**: Cloudflare free tier (100k requests/day)
- **Global CDN**: Sub-100ms response times worldwide
- **High Availability**: 99.99%+ uptime
- **Auto Scaling**: Handles traffic spikes automatically
- **Simple Updates**: Edit JSON, deploy, done

## Schema

See `schema.json` for the complete registry format specification.
