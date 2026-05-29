# Development Setup

Brika is a Bun monorepo. One install command, then everything is hot-reloadable.

## Prerequisites

* [Bun](https://bun.sh) ≥ 1.2.
* Git.
* A C compiler (rarely — only if a native dep needs to build, which is unusual with Bun).

That's it. No Node.js, no separate package manager.

## Clone and install

```sh
git clone https://github.com/brikalabs/brika.git
cd brika
bun install
```

`bun install` resolves every workspace package and installs node_modules at the root.

## Run in dev mode

```sh
bun run dev
```

This starts both the hub (port 3001) and the Vite UI dev server (port 5173) with hot reload. The hub is configured to proxy non-`/api/*` requests to Vite, so the UI is always live.

* **UI**: <http://localhost:5173> (Vite) — or <http://127.0.0.1:3001> (hub-proxied)
* **API**: <http://127.0.0.1:3001/api/health>

## Run one target

`bun run dev` runs everything. To run just one app:

```sh
bun --filter @brika/hub dev    # hub only
bun --filter @brika/ui dev     # UI only
```

## Build

```sh
bun run build       # all workspace packages
```

For a compiled binary, see [Build Pipeline](../architecture/build-pipeline.md):

```sh
bun run compile             # full binary, current platform
bun run compile:headless    # headless hub binary
```

## Test

```sh
bun test                                # everything
bun --filter @brika/sdk test            # one package
bun --filter @brika/hub test            # the hub
```

Bun's built-in test runner. Test files: `*.test.ts` adjacent to the source.

## Typecheck

```sh
bun run typecheck                       # everything
bun --filter @brika/hub typecheck       # one package
```

Uses [`tsgo`](https://github.com/microsoft/typescript-go) — a faster TypeScript front-end. `--noEmit` everywhere.

## Lint

```sh
bun run lint
```

Uses Biome. Configured in `biome.json` at the repo root. The pre-push convention is **always run lint before pushing** (and typecheck and tests too — but lint is the one that catches the most surprises).

## Working on a plugin

If you're authoring a plugin against this repo's SDK:

```sh
cd plugins/my-plugin
bun link                  # exposes the plugin as a workspace dep
```

In the hub's `.brika/brika.yml`:

```yaml
plugins:
  "@scope/my-plugin":
    version: "workspace:./plugins/my-plugin"
```

Restart the hub. The plugin loads from source; changes to `src/` rebuild on next reload.

## Scaffolding a new plugin

```sh
bun create brika
```

Walks you through the prompts. Lands a new directory under `plugins/` ready to go.

## Hot reload caveats

* **Plugin code** — reloads the plugin process on each save.
* **Hub code** — restart the hub. There's no in-process reload for the supervisor itself.
* **UI code** — Vite HMR handles it.

## Debugging

* `BRIKA_INSPECT=1` enables the Bun inspector on plugin processes.
* `LOG_LEVEL=debug` increases hub log verbosity.
* `BRIKA_SANDBOX_MODE=noop` disables the L3 sandbox for plugin processes (useful when a system call you expect to work is being blocked).

## See also

* **[Repository Structure](repo-structure.md)** — what every app and package owns.
* **[Coding Standards](coding-standards.md)** — conventions we enforce.
* **[Testing](testing.md)** — patterns for writing tests.
* **[Release Process](release.md)** — how releases are cut.
