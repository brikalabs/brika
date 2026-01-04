# Cloudflare Worker for BRIKA Schemas

This Cloudflare Worker serves `@brika/schema` schema files from `schema.brika.dev`, proxying requests to npm CDN (unpkg/jsdelivr).

**Purpose**: Display schema files from the `@brika/schema` npm package, e.g., `https://schema.brika.dev/0.1.0/plugin.schema.json`

## Features

- **Version Range Resolution**: Supports semver ranges (e.g., `^0.1.1`, `~0.1.0`, `>=0.1.0`)
- **Version Listing**: `/versions.json` endpoint lists all available stable versions
- **Latest Version**: `/latest` endpoint redirects to the latest stable version
- **Exact Versions**: Direct version access (e.g., `/0.1.1/plugin.schema.json`)
- **Pre-release Filtering**: Automatically filters out pre-release versions for range resolution
- **CORS Support**: Adds CORS headers for browser access

## Development

### Local Development

```bash
cd apps/schema-cdn
bun dev
```

The worker will start on `http://localhost:8787` (configurable in `wrangler.toml`).

### Testing

```bash
# List all available versions
curl http://localhost:8787/versions.json

# Get latest version
curl http://localhost:8787/latest/package.json

# Use version range (resolves to latest matching version)
curl http://localhost:8787/^19.2.0/package.json
curl http://localhost:8787/~19.2.0/package.json
curl http://localhost:8787/>=19.0.0/package.json

# Use exact version
curl http://localhost:8787/19.2.3/package.json
```

## Deployment

### Prerequisites

1. Cloudflare account (free tier works)
2. Wrangler CLI installed (or use `bunx wrangler`)

### Deploy to Cloudflare

```bash
cd apps/schema-cdn
bun deploy
```

Or using wrangler directly:

```bash
cd apps/schema-cdn
bunx wrangler deploy
```

### Configure Custom Domain

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Select your worker (`brika`)
4. Go to **Triggers** tab
5. Click **Add Custom Domain**
6. Enter: `schema.brika.dev`
7. Click **Add Custom Domain**

### Environment Variables

Configure in `wrangler.toml`:

```toml
[vars]
NPM_PACKAGE = "@brika/schema"  # npm package name
SCHEMAS_PATH = "/dist"          # Path to schemas in package
CDN_PROVIDER = "unpkg"          # Options: "unpkg" or "jsdelivr"
CACHE_MAX_AGE = 3600            # Cache max age in seconds
```

## How It Works

The worker:
1. Receives requests to `schema.brika.dev`
2. Parses version/range from the URL path
3. If range: queries npm registry to find matching stable version
4. Constructs CDN URL: `{cdn}/npm/{package}@{version}{path}/{file}`
5. Proxies request to CDN (unpkg or jsdelivr)
6. Adds CORS headers for browser access
7. Returns the schema/file

## URL Patterns

| Request | Description |
|---------|-------------|
| `/versions.json` | List all available stable versions |
| `/latest/{file}` | Redirects to latest stable version |
| `/^0.1.1/{file}` | Resolves to latest version matching `^0.1.1` |
| `/~0.1.0/{file}` | Resolves to latest version matching `~0.1.0` |
| `/>=0.1.0/{file}` | Resolves to latest version matching `>=0.1.0` |
| `/0.1.1/{file}` | Direct access to exact version |

## Examples

```bash
# List all versions
curl https://schema.brika.dev/versions.json

# Get latest schema file
curl https://schema.brika.dev/latest/plugin.schema.json

# Get schema file for version range
curl https://schema.brika.dev/^0.1.1/plugin.schema.json

# Get specific version schema file
curl https://schema.brika.dev/0.1.0/plugin.schema.json
```

## Cost

Free tier includes:
- 100,000 requests per day
- Unlimited bandwidth
- Global edge network

For schema hosting, you'll use < 1% of the free quota.

## Architecture

- **Framework**: Hono (lightweight, fast router for Cloudflare Workers)
- **Language**: TypeScript
- **Package Manager**: Bun
- **Structure**:
  - `worker.ts` - Entry point
  - `src/routes.ts` - Route definitions
  - `src/utils.ts` - Utility functions (version parsing, CDN URLs, etc.)
  - `src/types.ts` - TypeScript types
