# Repository Structure

The monorepo has three top-level workspaces:

* `apps/` — runnable applications.
* `packages/` — libraries consumed by apps and plugins.
* `plugins/` — first-party plugins shipped with the platform.

Plus `scripts/` for install/uninstall scripts and a handful of root-level config files (`biome.json`, `tsconfig.json`, `mortar.yml`, …).

## `apps/`

| Path | Owns |
|---|---|
| [`apps/hub/`](https://github.com/brikalabs/brika/tree/main/apps/hub) | The hub server — REST/SSE API, plugin supervisor, workflow runtime, board service, state persistence |
| [`apps/ui/`](https://github.com/brikalabs/brika/tree/main/apps/ui) | The React web UI — TanStack Router, brick rendering host, plugin bridge, board grid |
| [`apps/console/`](https://github.com/brikalabs/brika/tree/main/apps/console) | The `brika` CLI + Brix-based Ink TUI dashboard |
| [`apps/build/`](https://github.com/brikalabs/brika/tree/main/apps/build) | Binary build orchestration — `Bun.build` for bundling, `Bun.build --compile` for the standalone binary, cross-platform target matrix |
| [`apps/signaling/`](https://github.com/brikalabs/brika/tree/main/apps/signaling) | Cloudflare Workers coordinator + bootstrap SPA for remote access |
| [`apps/docs/`](https://github.com/brikalabs/brika/tree/main/apps/docs) | These docs (GitBook source) |
| [`apps/registry/`](https://github.com/brikalabs/brika/tree/main/apps/registry) | The plugin registry app |

## `packages/` — published

| Path | Owns |
|---|---|
| [`packages/sdk/`](https://github.com/brikalabs/brika/tree/main/packages/sdk) | `@brika/sdk` — the plugin SDK. Blocks, bricks, lifecycle, sparks, actions, schema |
| [`packages/flow/`](https://github.com/brikalabs/brika/tree/main/packages/flow) | `@brika/flow` — reactive streams. `Flow`, operators, combinators, sources |
| [`packages/compiler/`](https://github.com/brikalabs/brika/tree/main/packages/compiler) | `@brika/compiler` — build-time transforms (externals rewrite, action IDs, fs/os shims, i18n call-site) |
| [`packages/ipc/`](https://github.com/brikalabs/brika/tree/main/packages/ipc) | `@brika/ipc` — typed binary IPC protocol with Zod contracts |
| [`packages/schema/`](https://github.com/brikalabs/brika/tree/main/packages/schema) | `@brika/schema` — plugin manifest Zod schemas + JSON Schema generator |
| [`packages/plugin/`](https://github.com/brikalabs/brika/tree/main/packages/plugin) | `@brika/plugin` — plugin manifest types, health states, preferences |
| [`packages/create-brika/`](https://github.com/brikalabs/brika/tree/main/packages/create-brika) | `bun create brika` — interactive plugin scaffolder |
| [`packages/type-system/`](https://github.com/brikalabs/brika/tree/main/packages/type-system) | `TypeDescriptor` — Zod → JSON-serialisable type descriptors with compatibility checks |
| [`packages/errors/`](https://github.com/brikalabs/brika/tree/main/packages/errors) | `@brika/errors` — typed error model, catalog, wire envelope (RFC 9457) |

## `packages/` — internal

| Path | Owns |
|---|---|
| [`packages/router/`](https://github.com/brikalabs/brika/tree/main/packages/router) | Hono-based HTTP routing primitives with rate limiting, SSE helpers, BrikaError → HTTP conversion |
| [`packages/auth/`](https://github.com/brikalabs/brika/tree/main/packages/auth) | Auth services — user store, JWT, scopes, middleware |
| [`packages/permissions/`](https://github.com/brikalabs/brika/tree/main/packages/permissions) | Permission model — declarations, user-granted state |
| [`packages/grants/`](https://github.com/brikalabs/brika/tree/main/packages/grants) | Grant catalogue — typed operations with Zod schemas and handlers |
| [`packages/db/`](https://github.com/brikalabs/brika/tree/main/packages/db) | Drizzle ORM + `bun:sqlite` wrapper with migrations |
| [`packages/di/`](https://github.com/brikalabs/brika/tree/main/packages/di) | tsyringe-based DI container (hot-reload safe) |
| [`packages/events/`](https://github.com/brikalabs/brika/tree/main/packages/events) | Event bus with glob subscriptions |
| [`packages/serializable/`](https://github.com/brikalabs/brika/tree/main/packages/serializable) | (De)serialiser with Blob/Date/Uint8Array support |
| [`packages/i18n/`](https://github.com/brikalabs/brika/tree/main/packages/i18n) | Runtime translation registry |
| [`packages/i18n-dev/`](https://github.com/brikalabs/brika/tree/main/packages/i18n-dev) | Build-time i18n — Vite plugin, extractor, dev overlay |
| [`packages/ui-kit/`](https://github.com/brikalabs/brika/tree/main/packages/ui-kit) | `@brika/sdk/ui-kit` — component primitives for bricks and pages |
| [`packages/components/`](https://github.com/brikalabs/brika/tree/main/packages/components) | Component descriptors shared across the SDK UI kit |
| [`packages/banner/`](https://github.com/brikalabs/brika/tree/main/packages/banner) | Boot banner art |
| [`packages/brix/`](https://github.com/brikalabs/brika/tree/main/packages/brix) | Brix character — used in TUI animations |
| [`packages/tui/`](https://github.com/brikalabs/brika/tree/main/packages/tui) | TUI primitives — router, layout, widgets |
| [`packages/cli/`](https://github.com/brikalabs/brika/tree/main/packages/cli) | CLI framework — command parsing, help, prompts |
| [`packages/photon/`](https://github.com/brikalabs/brika/tree/main/packages/photon) | Theme tokens + colour system |
| [`packages/workflow/`](https://github.com/brikalabs/brika/tree/main/packages/workflow) | Workflow engine internals |
| [`packages/remote-access-protocol/`](https://github.com/brikalabs/brika/tree/main/packages/remote-access-protocol) | WebRTC tunnel protocol types |
| [`packages/shared/`](https://github.com/brikalabs/brika/tree/main/packages/shared) | Cross-package utilities |
| [`packages/testing/`](https://github.com/brikalabs/brika/tree/main/packages/testing) | Test helpers (mock IPC channels, fake clocks) |
| [`packages/archunit/`](https://github.com/brikalabs/brika/tree/main/packages/archunit) | Architecture rules enforced as tests |
| [`packages/workspace-tools/`](https://github.com/brikalabs/brika/tree/main/packages/workspace-tools) | Repo-wide tooling (linting, dependency checks) |
| [`packages/http/`](https://github.com/brikalabs/brika/tree/main/packages/http) | HTTP utilities shared between hub and tooling |
| [`packages/mortar/`](https://github.com/brikalabs/brika/tree/main/packages/mortar) | Internal task runner (referenced by `mortar.yml`) |

## `plugins/`

First-party plugins. Real, shipping integrations — also the canonical examples of how the SDK is used.

| Path | What it provides |
|---|---|
| [`plugins/builtin/`](https://github.com/brikalabs/brika/tree/main/plugins/builtin) | Core blocks — `condition`, `switch`, `delay`, `transform`, `log`, `merge`, `split`, `end`, `spark-receiver`, `http-request`, `clock` |
| [`plugins/timer/`](https://github.com/brikalabs/brika/tree/main/plugins/timer) | Timer + countdown blocks; timers-dashboard / photo / camera bricks |
| [`plugins/weather/`](https://github.com/brikalabs/brika/tree/main/plugins/weather) | Weather integration + dashboard bricks |
| [`plugins/matter/`](https://github.com/brikalabs/brika/tree/main/plugins/matter) | Matter/Thread smart-home integration |
| [`plugins/spotify/`](https://github.com/brikalabs/brika/tree/main/plugins/spotify) | Spotify playback + control |

## `scripts/`

| Path | Purpose |
|---|---|
| `install.sh` | macOS/Linux installer |
| `install.ps1` | Windows installer |
| `uninstall.sh` | macOS/Linux uninstaller |
| `uninstall.ps1` | Windows uninstaller |

## Other repos in the org

Brika is intentionally split across a handful of repos under [github.com/brikalabs](https://github.com/brikalabs):

* [`registry`](https://github.com/brikalabs/registry) — plugin registry Worker.
* [`schema-cdn`](https://github.com/brikalabs/schema-cdn) — JSON Schema CDN Worker.
* [`website`](https://github.com/brikalabs/website) — marketing site.
* [`clay`](https://github.com/brikalabs/clay) — React design system (the `@brika/clay` package the host UI uses).

## See also

* **[Development Setup](development.md)** — running everything locally.
* **[System Overview](../architecture/overview.md)** — which app/package owns which architectural concern.
