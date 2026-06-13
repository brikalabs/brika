# brika

The [Brika](https://github.com/brikalabs/brika) automation hub, distributed via npm.

```sh
npm install -g brika
# or run once without installing:
npx brika
```

## How it works

This package is a tiny launcher. Brika itself is a self-contained, Bun-compiled
binary; rather than ship a package per platform, the launcher downloads the binary
matching your machine on first run, verifies it against the release checksums,
caches it under your data dir, and execs it. Subsequent runs use the cache.
Running brika needs no Bun and no extra toolchain: the launcher runs on the Node
that ships with npm, and the downloaded binary is fully self-contained.

First run downloads ~100 MB once; after that it is instant.

## Supported platforms

| OS | Architectures |
|----|---------------|
| Linux | x64, arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## Where data is stored

An npm install keeps its data in the per-user directory (not inside `node_modules`):

- macOS / Linux: `~/.brika`
- Windows: `%LOCALAPPDATA%\brika`

Override with `BRIKA_HOME`. This is the same location the `curl | sh` installer uses,
so the two install methods share one data directory.

## Updating

```sh
npm update -g brika
```

The launcher fetches the binary matching its own version, so updating the package
updates the binary. (`brika update` self-patches only the standalone `curl | sh`
install.)

## Uninstalling

```sh
brika uninstall --purge     # first: remove the cached binary, data, and secrets
npm uninstall -g brika      # then: remove the launcher (npm won't touch the cache or data)
```

## Offline / restricted networks

The launcher needs network access on first run to fetch the binary. In air-gapped
environments, use the standalone installer instead:

```sh
curl -fsSL https://brika.dev/install.sh | sh
```
