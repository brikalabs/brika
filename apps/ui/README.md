# @brika/ui

The Brika dashboard — a React + Vite single-page app. Runs in two modes:

| Mode    | When                                          | API surface                                   |
| ------- | --------------------------------------------- | --------------------------------------------- |
| LAN     | Served by the hub at `https://<hub>:7878`     | Direct HTTPS to the hub                       |
| Remote  | Served from `hub.brika.dev` by the bootstrap  | WebRTC data-channel via the signaling worker  |

`apps/ui/src/lib/api/` picks the mode at boot — the worker stamps `<meta name="brika:hub" content="<name>">` into the shell, `?hub=<name>` is an override — and rewrites global `fetch` to route `/api/*` through the appropriate transport. See `docs/remote-access.md` for the full handshake.

## Development

```bash
bun --filter @brika/ui dev               # Vite on :5173
bun --filter @brika/ui build             # production bundle
```

The dev server proxies `/api/*` to a local hub. To exercise the WebRTC transport locally without a real coordinator, set `VITE_BRIKA_REMOTE_FORCE=1` and run `@brika/signaling` alongside.

## Layout

```
src/
  features/                # one folder per top-level feature (dashboard, settings, logs…)
  routes/                  # paths.ts + router config
  lib/
    api/                   # FetchTransport, DataChannelTransport, fetch interceptor
    use-locale.ts          # i18n hook
    ...
  features/settings/components/remote-access/   # claim flow + signaling state UI
  components/              # cross-feature primitives
  i18n/                    # locale files (en, fr)
```

## Styling

Built on [@brika/clay](https://github.com/brikalabs/clay) — the design system lives in its own repo and is consumed from npm. Tailwind v4 utility classes are kept to layout/spacing only; everything visual flows through Clay tokens.
