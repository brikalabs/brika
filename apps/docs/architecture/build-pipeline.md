# Build Pipeline

`apps/build` is the orchestrator that turns the Brika monorepo into a standalone, cross-platform binary. It uses `Bun.build` for bundling and `Bun.build({ compile: true })` for the final single-file executable.

## Targets

Two top-level targets:

| Target | Includes |
|---|---|
| `full` | Hub + UI assets + CLI + TUI in one binary (the default `brika`) |
| `headless` | Hub only — smaller, no TUI, no CLI surface (the Docker image, `brika-hub`) |

Each target is platform-multiplied:

* `bun-linux-x64`
* `bun-linux-arm64`
* `bun-darwin-x64`
* `bun-darwin-arm64`
* `bun-windows-x64`

`bun --filter @brika/build build --list` shows every available combination.

## CLI

```sh
bun run build                                 # default target, current platform
bun --filter @brika/build build --compile     # produce a binary, not just a bundle
bun --filter @brika/build build --target=headless --compile
bun --filter @brika/build build --platform=bun-linux-arm64 --compile
```

Output lands in `apps/build/dist/<target>/`.

## Pipeline

```
1. bun install (workspace)
2. Resolve target → entrypoint(s)
3. Bun.build entry points, bundle into one or more JS files
4. (optional) Bun.build --compile to produce the binary
5. (optional) Embed extras (UI static assets, locale bundles, bundled Bun for plugin spawning)
6. Write to dist/<target>/
```

## Bundle plugins

`apps/build/src/plugins/` contains Bun plugins that strip dev-only imports — `mock-files`, `react-devtools-core`, etc. — to reduce binary bloat. They run as part of every build.

## Embedded UI

The web UI's static bundle (`apps/ui/dist/`) is embedded into the binary. The hub serves it from memory unless `BRIKA_STATIC_DIR` overrides. The headless target skips this — Docker users typically reach the UI via the brika.dev coordinator instead.

## Embedded Bun

The hub spawns plugins as Bun subprocesses. To avoid relying on the user having Bun installed, the build embeds the Bun binary inside the package. The hub's plugin spawner uses `BRIKA_BUN_PATH` if set, otherwise falls back to the embedded Bun.

## Embedded locales

UI translation bundles are embedded too, so an air-gapped install ships with every supported locale.

## buildInfo macro

`apps/hub/src/runtime/system/build-info.macro.ts` is a Bun macro that runs at build time, captures the current git commit, branch, build timestamp, and version, and bakes them into the binary as constants. The CLI's `brika version` reads these — what you see is exactly what's running.

## Build modes

* **Development** — `bun run dev` from the repo root. Hub + UI run from source with hot reload, Vite serves the UI, no compilation step.
* **Release** — `bun run compile`. Full target, current platform.
* **CI** — `bun --filter @brika/build build --compile --platform=<target>`. Cross-compile for every release platform.

## Signing

Released binaries are optionally signed with minisign. The installer scripts (`install.sh`, `install.ps1`) verify against the embedded public key — see [Install Scripts](install-scripts.md). Signing is part of the release workflow, not the local build.

## See also

* **[Install Scripts](install-scripts.md)** — how the released binary is distributed.
* **[Installation](../basics/installation.md)** — user-facing install flow.
* **[Development Setup](../contributing/development.md)** — local dev mode.
