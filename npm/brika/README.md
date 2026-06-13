# brika

The [Brika](https://github.com/brikalabs/brika) automation hub, distributed via npm.

```sh
npm install -g brika
# or run once without installing:
npx brika
```

`brika` is a self-contained, Bun-compiled binary. This package is a thin launcher:
on install, npm pulls the single prebuilt binary that matches your platform
(`@brika/cli-<platform>-<arch>`) as an optional dependency, and the `brika` command
execs it. No Bun or Node toolchain is required at runtime.

## Supported platforms

| OS | Architectures |
|----|---------------|
| Linux | x64, arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## Where data is stored

An npm install keeps its data in the per-user directory, **not** inside
`node_modules` (which a reinstall would wipe):

- macOS / Linux: `~/.brika`
- Windows: `%LOCALAPPDATA%\brika`

Override with `BRIKA_HOME`. This is the same location the `curl | sh` installer uses,
so the two install methods share one data directory.

## Updating

Use your package manager:

```sh
npm update -g brika
```

(`brika update` self-patches only the standalone `curl | sh` install.)

## Uninstalling

```sh
npm uninstall -g brika      # removes the binary
brika uninstall --purge     # also removes data + stored secrets (run before uninstalling)
```
