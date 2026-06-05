# Installation

Brika ships as a statically-linked binary that bundles its own Bun runtime. There are no extra dependencies to install — no Node.js, no Bun, no Python.

You can install it three ways: the installer script (recommended), Docker, or building from source.

## Installer script

### macOS and Linux

```sh
curl -fsSL https://brika.dev/install.sh | bash
```

The script:

1. Detects your platform (`linux` or `darwin`) and architecture (`x64` or `arm64`).
2. Resolves the version to install. By default this is the latest stable release on GitHub. Override with `BRIKA_VERSION`:
   * `BRIKA_VERSION=canary` — the most recent prerelease, resolved by matching the dated tag pattern `canary-YYYYMMDD-HHMMSS-*` and picking the newest.
   * `BRIKA_VERSION=v1.2.3` — pin to a specific tag.
3. Downloads the appropriate `brika-<platform>-<arch>.tar.gz` from the GitHub release assets.
4. Optionally verifies the download against a [minisign](https://jedisct1.github.io/minisign/) signature. When the installer ships with an embedded public key, verification is mandatory unless you set `BRIKA_INSECURE=1`. See [Install Scripts](../architecture/install-scripts.md) for the details of the verification handshake.
5. Extracts the binary into `~/.brika/bin/` (override with `BRIKA_INSTALL_DIR`).
6. Prints the line you need to add to your shell config to put `~/.brika/bin` on `PATH`.

### Windows

```powershell
iwr -useb https://brika.dev/install.ps1 | iex
```

Same logic, but installs to `%LOCALAPPDATA%\brika\bin\`.

### Updating

```sh
brika update          # apply the latest stable
brika update --check  # see what is available without installing
```

`brika update` runs the updater in-process (no running hub required): it checks GitHub Releases on your saved channel, swaps the binary in place, and, if a hub is running, asks you to restart it so the new version takes effect.

### Uninstalling

Run the uninstaller script (there is no dedicated `brika` subcommand for this):

```sh
# macOS / Linux
curl -fsSL https://brika.dev/uninstall.sh | bash

# Windows (PowerShell)
iwr -useb https://brika.dev/uninstall.ps1 | iex
```

Pass `--purge` (Unix) or `-Purge` (PowerShell) to also delete every `.brika/` workspace this user owns.

## Docker

```sh
docker run -d \
  --pull=always \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  ghcr.io/brikalabs/brika:latest
```

`--pull=always` ensures Docker fetches the newest image on every restart, even if a stale local copy exists. The `-v ./config:/app/.brika` mount persists your hub configuration, installed plugins, and database between container restarts.

### Docker Compose

```yaml
services:
  brika:
    image: ghcr.io/brikalabs/brika:latest
    pull_policy: always
    container_name: brika
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./config:/app/.brika
```

```sh
docker compose up -d
```

Inside the container the hub runs the **headless** build — same hub server, no TUI, no CLI bundled in. Send signals or run `docker exec brika brika status` if you need to interact with it.

### Image tags

| Tag | What it tracks |
|---|---|
| `latest` | The most recent stable release |
| `canary` | The most recent prerelease tag |
| `vX.Y.Z` | A pinned release |

The headless image is much smaller than the full binary because it omits the TUI and the CLI surface.

## Building from source

You need [Bun](https://bun.sh) ≥ 1.2. Brika is a monorepo managed by Bun workspaces.

```sh
git clone https://github.com/brikalabs/brika.git
cd brika
bun install
```

To compile a standalone binary:

```sh
bun run compile             # full target (CLI + TUI + hub + UI assets)
bun run compile:headless    # headless hub only
```

Compiled binaries land in `apps/build/dist/<target>/`. Cross-compile for a different platform:

```sh
bun --filter @brika/build build --compile --platform=bun-linux-arm64
bun --filter @brika/build build --list  # see every available target
```

See [Build Pipeline](../architecture/build-pipeline.md) for the full story of how the binary is assembled.

## What gets installed

| Path | Contents |
|---|---|
| `~/.brika/bin/brika` | The Brika binary |
| `~/.brika/bin/bun` | Bundled Bun runtime — used to spawn plugin processes |
| `~/.brika/bin/ui/` | Bundled web UI static assets |
| `~/.brika/bin/locales/` | Translation bundles for the UI |
| `.brika/` | Per-workspace data — see [The .brika Directory](data-directory.md) |

On Windows the install directory is `%LOCALAPPDATA%\brika\bin\`.

## Shell completions

```sh
brika completions          # auto-detect shell and install
brika completions bash     # explicit
brika completions zsh
brika completions fish
```

The command writes the appropriate completion script into your shell's standard config location.

## Verifying the install

```sh
brika --version
brika status     # "no hub running in /Users/you" is the expected first response
```

## See also

* **[First Run](first-run.md)** — start the hub, walk through the UI.
* **[Configuration File](../cli/configuration.md)** — what to put in `.brika/brika.yml`.
* **[Install Scripts](../architecture/install-scripts.md)** — how the installer resolves versions and verifies signatures.
