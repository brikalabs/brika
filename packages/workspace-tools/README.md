# @brika/workspace-tools

Interactive CLI tools for managing the Brika monorepo — version bumping and npm publishing.

## Commands

These commands are available from the **workspace root**:

| Command | Description |
|---|---|
| `bun run bump` | Bump package versions |
| `bun run publish-packages` | Publish packages to npm |
| `bun run deadcode` | Find unused files, exports, and dependencies (knip) |

---

## `bun run bump` — Version bumper

Interactively (or non-interactively) bumps the `version` field across workspace packages.

### Usage

```sh
bun run bump                                   # fully interactive
bun run bump minor                             # type pre-selected, pick packages
bun run bump minor --all                       # apply to all packages, no prompts
bun run bump minor --filter "@brika/*"         # apply to matching packages only
bun run bump 1.2.0 --all                       # set an exact version on all packages
bun run bump patch --dry-run                   # preview changes without writing files
```

### Bump types

| Type | Example |
|---|---|
| `major` | `0.3.0` → `1.0.0` |
| `minor` | `0.3.0` → `0.4.0` |
| `patch` | `0.3.0` → `0.3.1` |
| `x.y.z` | `0.3.0` → `1.2.0` (exact) |

### Flags

| Flag | Short | Description |
|---|---|---|
| `--all` | `-a` | Skip package selection, apply to all (or all filtered) |
| `--filter <pattern>` | `-f` | Filter packages by name — glob, exact, or substring. Repeatable. |
| `--dry-run` | | Preview what would change without writing files |
| `--help` | `-h` | Show help |

### Filter examples

```sh
--filter "@brika/*"          # all @brika scoped packages
--filter hub                 # any package whose name contains "hub"
--filter @brika/sdk          # exact match
-f @brika/sdk -f @brika/ui   # multiple filters
```

---

## `bun run publish-packages` — npm publisher

Interactively selects and publishes public workspace packages to npm.

### Usage

```sh
bun run publish-packages                       # fully interactive
bun run publish-packages --all                 # publish all public packages
bun run publish-packages --filter "@brika/*"   # publish matching packages
bun run publish-packages --all --dry-run       # preview without publishing
```

### Publish flow

1. **Select** — choose which public packages to publish (skipped with `--all` or `--filter`)
2. **Preview** — shows a summary for each selected package: files, export paths, bin entries, lifecycle hooks
3. **Confirm** — asks "Publish N packages to npm?" before doing anything
4. **`bun install`** — runs at workspace root to resolve `workspace:` protocol versions
5. **Publish** — runs `bun publish --access public` for each package sequentially
6. **Summary** — reports successes and any failures

### 2FA / OTP

If your npm account requires 2FA, the terminal is kept open during each publish step so you can paste your code when prompted. No flag is needed.

### Flags

| Flag | Short | Description |
|---|---|---|
| `--all` | `-a` | Skip package selection, publish all public packages |
| `--filter <pattern>` | `-f` | Filter packages by name — glob, exact, or substring. Repeatable. |
| `--dry-run` | | Preview what would be published without actually publishing |
| `--help` | `-h` | Show help |

### Which packages are published?

Any workspace package **without** `"private": true` in its `package.json` is considered publishable. Private packages (`@brika/hub`, `@brika/ui`, `@brika/workspace-tools`, etc.) are never shown.

---

## `bun run deadcode` — Dead-code finder

Scans the workspace for unused files, exports, types, and dependencies using [knip](https://knip.dev). **Zero config** — the knip config is generated on each run from the repo's own conventions (see [`src/knip-config.ts`](./src/knip-config.ts)):

- `bin` / `main` / `exports` fields → entry points. For library packages where `exports` targets `./dist/x.js`, the generator maps back to `./src/x.ts`.
- Plugin workspaces → `src/{bricks,blocks,pages}/**` added as entries (dynamically loaded by the hub).
- `apps/hub` → `src/runtime/plugins/prelude/**` added as entries.
- `apps/ui` → `src/components/ui/**` ignored (shadcn scaffolding).
- `@brika/sdk` subpath imports resolve to source via generated `paths` mappings.

### Usage

```sh
bun run deadcode                              # full report
bun run deadcode --filter "@brika/*"          # restrict scope
bun run deadcode --filter @brika/hub          # single workspace
bun run deadcode --production                 # skip dev/test entries
bun run deadcode --fix                        # apply safe auto-fixes
bun run deadcode --json > deadcode.json       # machine-readable output
bun run deadcode --eject                      # dump the generated config to deadcode.config.json
```

### Flags

| Flag | Short | Description |
|---|---|---|
| `--filter <pattern>` | `-f` | Workspace name (glob, exact, or substring). Repeatable. |
| `--production` | | Limit analysis to production code paths |
| `--fix` | | Apply safe auto-fixes (removes unused exports/files) |
| `--json` | | Emit JSON to stdout |
| `--strict` | | Stricter analysis — treat all deps as production |
| `--eject` | | Write the generated config to `./deadcode.config.json` and exit (for hand-tuning) |
| `--help` | `-h` | Show help |

Exits non-zero when findings are reported, so the command is safe to wire into CI.

### When to use `--eject`

If the generator's output isn't quite right (e.g. a one-off workspace needs an extra entry pattern), run `bun run deadcode --eject` to freeze the current generated config into a real `deadcode.config.json`. You can then hand-edit it and commit. As soon as `deadcode.config.json` exists in the repo root, the wrapper stops regenerating and uses the committed file instead — delete `deadcode.config.json` to fall back to auto-config.

---

## Development

```sh
# Run the bump tool directly
bun run dev

# Run the publish tool directly
bun run dev:publish

# Type-check
bun run tsc

# Tests
bun test
```
