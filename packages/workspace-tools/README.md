# @brika/workspace-tools

Interactive CLI tools for managing the Brika monorepo — version bumping and npm publishing.

## Commands

Both commands are available from the **workspace root**:

| Command | Description |
|---|---|
| `bun run bump` | Bump package versions |
| `bun run publish-packages` | Publish packages to npm |

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
