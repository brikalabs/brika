# Install Scripts

`scripts/install.sh` (Unix) and `scripts/install.ps1` (Windows) are the canonical ways to install Brika. They detect the platform, resolve the version, download the binary, optionally verify a minisign signature, and place the binary in `~/.brika/bin/`.

This page covers the resolution and verification logic — the parts most likely to surprise.

## Platform detection

`install.sh`:

* OS: `darwin` (macOS) or `linux`.
* Arch: `x64` (`x86_64`) or `arm64` (`arm64`, `aarch64`).

`install.ps1`:

* Platform: `windows-x64` only today.

The constructed asset name is `brika-<os>-<arch>.tar.gz` (or `.zip` on Windows).

## Version resolution

`BRIKA_VERSION` (default `latest`) controls which release the installer downloads:

| Value | Behaviour |
|---|---|
| `latest` | GitHub `releases/latest` — newest stable |
| `canary` | GitHub releases list, filter tags matching `canary-YYYYMMDD-HHMMSS-*`, pick the chronologically newest |
| `v1.2.3` | Pin to that exact tag |

The canary path is more nuanced than just "first prerelease." The release pipeline tags canaries with a date prefix (`canary-20260301-123045-<sha>`), so lexical ordering matches chronological ordering — `sort -r | head -1` reliably picks the newest. A rolling `canary` tag would be unreliable (race between the tag move and the asset upload).

## Download

Uses `curl -fsSL` (Unix) or `Invoke-WebRequest` (Windows). The asset URL is constructed from the resolved tag:

```
https://github.com/brikalabs/brika/releases/download/<tag>/brika-<platform>.tar.gz
```

The tarball is extracted to `~/.brika/bin/` (override with `BRIKA_INSTALL_DIR`).

## Signature verification

When the installer ships with an embedded minisign public key, verification is **mandatory**. The flow:

1. Download the asset.
2. Download the matching `.minisig` file.
3. Write the embedded public key to a temp file in minisign format.
4. Run `minisign -V -p <pubkey> -m <asset>`.
5. On verification failure, bail out without touching the existing install.

If `minisign` isn't installed on the user's machine, the installer suggests installing it (it's available on Homebrew, apt, Chocolatey).

Override: `BRIKA_INSECURE=1` skips verification even when the public key is present. **Not recommended.**

Pre-ceremony (before the signing key was minted), the installer ships with an empty public key — verification is implicitly skipped because there's nothing to verify against.

## What gets installed

| File | Purpose |
|---|---|
| `~/.brika/bin/brika` | The binary |
| `~/.brika/bin/bun` | Bundled Bun (sometimes; depends on target) |
| `~/.brika/bin/ui/` | UI static assets (full target) |
| `~/.brika/bin/locales/` | UI translation bundles |

On Windows: `%LOCALAPPDATA%\brika\bin\`.

## PATH

The installer prints the line to add to your shell config — it does **not** silently modify `.zshrc`/`.bashrc`. On Windows, the equivalent for `PATH` is suggested.

After PATH is set:

```sh
brika --version
```

…should return the just-installed version.

## Detecting an existing install

Before downloading, the installer calls `brika version --json` to check if there's already an install and what version it is. If the version matches the requested target, the installer skips the download. Force a reinstall with `brika update --force` (after an initial install).

## Uninstall scripts

`scripts/uninstall.sh` and `scripts/uninstall.ps1` are thin delegators: when the
binary works they delegate the removal to `brika uninstall --purge` (the single
source of truth for the logic), and only fall back to a hardcoded directory
removal when the binary is missing or broken. (Unix `exec`s it; Windows calls it
and then removes the install tree itself, since the running `.exe` can't delete
itself.)

* `brika uninstall` removes the binary, PATH entries, and shell completions, and
  keeps the data dir by default.
* `--purge` additionally deletes the resolved data dir (`$BRIKA_HOME`, else
  `~/.brika` or `%LOCALAPPDATA%\brika`) and the OS keychain bucket for this
  instance, driven by the secret index.
* On Windows the running `.exe` cannot delete itself, so `brika uninstall` clears
  the data dir + keychain and the PowerShell script removes the install tree once
  the process has exited.

The scripts purge by default, since invoking `curl ... | bash` is an explicit
"remove everything" gesture. When piped they run non-interactively (no prompt);
set `BRIKA_KEEP_DATA=1` to keep the data dir, or `BRIKA_YES=1` to skip the prompt
in an interactive run.

## Self-update

`brika update` re-runs the installer logic in-process (no external script download). The hub does an in-place binary swap and restarts via the supervisor on exit code 42.

## See also

* **[Installation](../basics/installation.md)** — user-facing install.
* **[Build Pipeline](build-pipeline.md)** — how the artefacts are produced.
* **[Environment Variables](../cli/environment.md)** — `BRIKA_VERSION`, `BRIKA_INSTALL_DIR`, `BRIKA_INSECURE`.
