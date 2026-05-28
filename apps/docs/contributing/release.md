# Release Process

Brika ships two release tracks: **stable** (`vX.Y.Z` tags, what `latest` points at) and **canary** (`canary-YYYYMMDD-HHMMSS-<sha>` tags, the rolling head of `main`).

## Channels

| Channel | Tag pattern | Cadence | Audience |
|---|---|---|---|
| **stable** | `vX.Y.Z` | Every few weeks | Default for new installs |
| **canary** | `canary-YYYYMMDD-HHMMSS-<sha>` | Per merge to main | Early adopters, plugin authors |

The installer resolves `BRIKA_VERSION=latest` to the newest stable, `canary` to the newest canary, or a literal tag to the exact tag. See [Install Scripts](../architecture/install-scripts.md).

## Versioning

Semver:

* **Patch** — backwards-compatible fixes (`0.3.1 → 0.3.2`).
* **Minor** — new APIs, new manifest fields, new built-in blocks (`0.3.2 → 0.4.0`).
* **Major** — renamed/removed APIs, renamed/removed blocks/bricks (saved IDs would break), breaking IPC contracts, breaking schema changes (`0.4.0 → 1.0.0`).

For the SDK specifically: renaming an exported action changes its compiled ID — see [Actions](../plugins/actions.md). Treat that as a breaking change.

## Cutting a stable release

1. Bump the version in the root `package.json` and every workspace package.
2. Update the changelog (or release notes) summarising changes since the previous stable.
3. Open a PR, get review, merge.
4. The CI release workflow tags `vX.Y.Z`, builds binaries for every platform, signs them with minisign, uploads to GitHub Releases.
5. The installer's `latest` alias auto-resolves to the new tag.
6. Docker images publish to `ghcr.io/brikalabs/brika:vX.Y.Z` and `ghcr.io/brikalabs/brika:latest`.

## Cutting a canary

Canaries are automatic. Every merge to `main` triggers the canary workflow:

1. CI computes a dated tag: `canary-$(date +%Y%m%d-%H%M%S)-<short-sha>`.
2. Builds binaries for every platform.
3. Signs them.
4. Uploads to GitHub Releases marked as **prerelease**.

The installer's canary resolver lists releases, filters by the `canary-*` tag prefix, and picks the chronologically newest (which the dated tag guarantees is the lexically largest).

## Signing

Release artefacts are signed with [minisign](https://jedisct1.github.io/minisign/). The public key is embedded in `install.sh` and `install.ps1`. The installer verifies the signature on download and refuses to install unverified artefacts unless `BRIKA_INSECURE=1` is set.

The signing key lives in CI's secret store. It does not leave the release runner.

Pre-ceremony: when the project shipped its first signed release, the installer was updated atomically with the embedded public key. Before that, installs were unverified — `BRIKA_INSECURE` had no effect.

## Pre-push checklist

Before pushing to `main`:

```sh
bun run lint
bun run typecheck
bun test
```

If any of the trio fails, the merge will fail — and the canary won't ship.

## Release notes

For each stable release, the changelog or release notes should include:

* Highlights — user-facing changes worth calling out.
* New features — additions, new APIs.
* Fixes — notable bug fixes.
* Breaking changes — anything that requires user action.
* SDK changes — additions/removals to `@brika/sdk` and friends.

Plugin authors read these to know what's safe to use; users read them to know what's worth upgrading for.

## Plugin SDK versioning

The SDK is published independently. A plugin's `engines.brika` range determines which hubs accept it. When the SDK gets a breaking change:

1. Bump `@brika/sdk` major.
2. Bump every shipped plugin's `engines.brika` to require the new SDK.
3. Plugins authored externally need to be updated to match.

Backwards-compatible SDK changes (new exports, new optional fields) are minor or patch.

## Branch protection

Releases happen from `main`. Direct pushes are blocked by the repo's ruleset — every change goes through a PR. SSH-signed commits are required. GitHub's web rebase strips signatures; rebase locally instead.

## See also

* **[Build Pipeline](../architecture/build-pipeline.md)** — how the binary is built.
* **[Install Scripts](../architecture/install-scripts.md)** — version resolution.
* **[Development Setup](development.md)** — local builds before tagging.
