# @brika/build

Build orchestration for Brika binaries. Owns the Bun.build pipeline,
compile-time plugins, and the target registry.

This package is **private** and produces no published artifact of its
own — its job is to read the source trees of other packages
(`@brika/console`, `@brika/hub`, …) and produce executables in
`apps/build/dist/<target>/`.

## Targets

A *target* is a `(entrypoint, binaryName)` pair. Switching targets
picks a different source-tree root to bundle, with the same plugin
stack applied.

| Target     | Entrypoint                 | Binary       | What it ships                                                |
| ---------- | -------------------------- | ------------ | ------------------------------------------------------------ |
| `full`     | `apps/console/src/main.ts` | `brika`      | Operator CLI + Brix TUI dashboard + inline hub + embedded UI |
| `headless` | `apps/hub/src/main.ts`     | `brika-hub`  | Hub server only — no CLI surface, no TUI                     |

Add a target by appending an entry to `src/targets.ts`. The CLI and the
plugin stack are target-agnostic; you don't have to touch them.

## Usage

```bash
# Default: bundle the `full` target to JS (Docker / dev workflow).
bun --filter @brika/build build

# Standalone binary for the host platform.
bun --filter @brika/build build --compile

# Headless hub binary.
bun --filter @brika/build build --target=headless --compile

# Cross-compile.
bun --filter @brika/build build --compile --platform=bun-linux-arm64

# List targets and platforms.
bun --filter @brika/build build --list
```

Outputs:

```
apps/build/dist/
  full/
    brika              # `--compile` mode
    server.<hash>.js   # bundle mode
  headless/
    brika-hub
    server.<hash>.js
```

The repo-root `bun run compile` calls this package with the `full`
target. `bun run compile:headless` calls it with `--target=headless`.
CI (`.github/workflows/build.yml`) runs `--compile --platform=…` per
matrix entry.

## Compile-time plugins

Both `compile` and `bundle` apply the same plugin stack (see
`src/plugins/`). Each plugin is one file and one focused concern.

### `stub-react-devtools-core`

`ink` (the React-for-terminal renderer used by the TUI) imports
`react-devtools-core` unconditionally at the top of `devtools.js`, but
the real package is an optional peer that only matters when DevTools
is enabled. The compiled binary never opts in.

This plugin intercepts the resolve and serves a tiny empty module
instead — saving ~600 KB and avoiding a `module not found` at runtime
(the binary has no `node_modules` to fall back to).

### `stub-mock-files`

Strips every `*.mock.ts` file from the produced binary.

**Convention:** any file with the `.mock.ts` suffix is a dev-only mock
layer (fake data, scripted streams, test seams). The dev runtime
resolves these normally; only the compiled binary sees the stub. The
stub throws at module-evaluation time so any (mis)configured runtime
import is rejected cleanly — callers can `try/catch` to fall back.

Example: `apps/hub/src/__dev__/updater.mock.ts` exports a
`MockUpdateProvider`. The bootstrap dynamically imports this module
only when `BRIKA_DEV_FAKE_UPDATE` is set. In the production binary the
import lands on the throwing stub, the bootstrap's catch fires, it
logs a warning and falls back to `GitHubUpdateProvider`. Defense in
depth: even if the env var is set on a prod hub, no fake data leaks.

### Verifying the strip

Run a compile, then grep the binary for symbols that only exist inside
a `.mock.ts` body:

```bash
bun --filter @brika/build build --compile
strings apps/build/dist/full/brika | grep -c 'Synthetic release notes'  # → 0
strings apps/build/dist/full/brika | grep -c 'stripped from production builds'  # → 1 (the stub)
```

A non-zero count on a mock-body-only string would indicate the plugin
isn't catching the file — either the filename doesn't match `*.mock.ts`
or the import path doesn't reach this stage of the bundler.

## Layout

```
apps/build/
  src/
    index.ts        # CLI dispatcher (parseArgs + routes to compile/bundle)
    compile.ts      # --compile path → standalone binary
    bundle.ts      # default path → server.<hash>.js for Docker/dev
    log.ts          # tiny ergonomic console helpers (step, done, fileSize, …)
    targets.ts      # target + platform registry
    plugins/
      stub-react-devtools-core.ts
      stub-mock-files.ts
    __tests__/
      log.test.ts
  package.json
  tsconfig.json
```
