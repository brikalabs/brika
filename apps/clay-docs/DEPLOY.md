# Deploying clay-docs to clay.brika.dev

The site deploys to Cloudflare Pages via Wrangler.

## One-time setup

Run from `apps/clay-docs/` (or via `bun run --cwd apps/clay-docs <cmd>`).

1. **Authenticate Wrangler against the Cloudflare account that owns
   `brika.dev`:**

   ```bash
   bunx wrangler login
   ```

2. **Create the Pages project:**

   ```bash
   bunx wrangler pages project create clay-brika-dev --production-branch main
   ```

3. **Attach the custom domain:**

   ```bash
   bunx wrangler pages domain add clay.brika.dev --project-name clay-brika-dev
   ```

   Cloudflare will provision the DNS record automatically if `brika.dev`
   lives on the same account. If it lives elsewhere, add a CNAME record
   on the DNS host:

   ```
   clay  CNAME  clay-brika-dev.pages.dev
   ```

## Day-to-day deploys

From the repo root:

```bash
bun run clay:deploy           # production push to clay.brika.dev
bun run clay:deploy:preview   # preview branch (won't go live)
```

Each command runs `astro build` then `wrangler pages deploy ./dist
--project-name clay-brika-dev`.

## CI

A future CI step can run the same `clay:deploy` script on each merge
to `main`, scoped via `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. See
[wrangler.jsonc](./wrangler.jsonc) for the project configuration.
