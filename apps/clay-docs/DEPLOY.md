# Deploying clay-docs to clay.brika.dev

The site deploys to Cloudflare Workers (Static Assets) via Wrangler.
Astro builds a static `./dist`, which the Worker serves directly — no
server-side script required.

## One-time setup

Run from `apps/clay-docs/` (or via `bun run --cwd apps/clay-docs <cmd>`).

1. **Authenticate Wrangler against the Cloudflare account that owns
   `brika.dev`:**

   ```bash
   bunx wrangler login
   ```

2. **First deploy creates the Worker:**

   ```bash
   bun run deploy
   ```

   The Worker is named `clay-brika-dev` (from [wrangler.jsonc](./wrangler.jsonc)).

3. **Attach the custom domain** in the Cloudflare dashboard:

   Workers & Pages → `clay-brika-dev` → Settings → Domains & Routes →
   Add → Custom Domain → `clay.brika.dev`.

   Cloudflare will provision the DNS record automatically if `brika.dev`
   lives on the same account.

## Day-to-day deploys

From the repo root:

```bash
bun run clay:deploy           # production push to clay.brika.dev
bun run clay:deploy:preview   # uploads a preview version (not promoted)
```

`deploy` runs `astro build` then `wrangler deploy` (promotes immediately).
`deploy:preview` runs `wrangler versions upload`, which returns a
preview URL without affecting production.

## CI

A future CI step can run `clay:deploy` on each merge to `main`, scoped
via `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. See
[wrangler.jsonc](./wrangler.jsonc) for the project configuration.
