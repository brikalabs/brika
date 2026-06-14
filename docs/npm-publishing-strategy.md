# Brika npm Publishing + Per-Package Changelog Strategy

Authoritative decision document. Claims were verified against the tree at the
time of writing (Bun 1.3.14). Produced from a multi-agent analysis with an
adversarial verification pass.

## 1. Executive summary

- **Publish a small public surface, not everything.** Ship the `@brika/sdk`
  runtime closure (8 libraries) plus `create-brika`, plus the 7 plugins. Flip
  the remaining internal libraries to `private: true`. Today the workspace
  exposes 28 non-private libraries in `packages/*` plus 7 plugins (35 public).
  Most libraries have no external consumer: plugins reach them only through the
  `@brika/sdk` facade, and the author toolchain (`cli`, `compiler`, `schema`) is
  bundled into `dist/bin/brika.js`. Final surface: **8 libraries + `create-brika`
  + 7 plugins = 16 public packages** (the 8th library is `@brika/testing`, which
  backs the documented `@brika/sdk/testing` author API).

- **Two correctness blockers gate everything (fixed in PR 1):**
  1. `@brika/sdk` value-imports `@brika/flow` and `@brika/ui-kit` but declared
     them in `devDependencies`. Because the SDK ships raw `.ts`, an npm-installed
     plugin crashes with `Cannot find module '@brika/flow'` on first load.
     `@brika/serializable` is type-only but must also move (type resolution
     against the raw `.ts`). All three are now `dependencies`.
  2. `create-brika` declared `@brika/cli` as a runtime `dependency` while
     `@brika/cli` is private. The code is fine (`dist/index.js` bundles the CLI,
     zero references) but the manifest would force `npm install create-brika` to
     resolve `@brika/cli` from npm and fail. `@brika/cli` is build-time-only and
     is now a `devDependency`.

- **Tarball hygiene: standardize the published set on a `files[]` allowlist and
  delete every `.npmignore`.** The denylist convention leaks under `bun publish`
  (`@brika/router` ships ~138 KB of `coverage/lcov.info` + tsconfig because its
  `.npmignore` lists only test globs). An allowlist is fail-safe by default.

- **The publisher must use `npm publish --provenance`, never `bun publish`.** Bun
  1.3.14 has no `--provenance` flag and no OIDC / trusted-publishing support (it
  offers only `--otp` / `--auth-type` / `--tolerate-republish`). The binary
  pipeline already shells to `npm publish --provenance` in
  `apps/build/src/npm-dist.ts`; the new lib/plugin publisher must do the same.

- **`workspace:*` ranges must be rewritten to concrete `^x.y.z` before publish.**
  Unlike `bun publish`, `npm publish` does not rewrite them. `changeset version`
  does this rewrite as part of versioning; the publisher then publishes the
  already-rewritten manifests.

- **Versioning: hybrid via Changesets**, with one `fixed` group (the platform:
  SDK + closure libs + `create-brika`, which are tightly coupled) and independent
  plugins (a lone plugin fix bumps only that plugin). The `ignore` list is
  deny-by-default (ignore all `@brika/*`, un-ignore the published set) so it stays
  short and a new internal package never silently cascade-publishes.

- **`engines.brika` must track the binary release line, not the Changesets
  number.** The hub's compatibility gate checks
  `semver.satisfies(stripPrerelease(HUB_VERSION), engines.brika)`, where
  `HUB_VERSION` is `buildInfo.version` (a build-time macro from the binary
  release version, explicitly "no longer authoritative" via `package.json`). A
  `sync:engines-brika` step must rewrite each plugin's `engines.brika` to
  `^<binary-release minor>`. The platform-group version is kept equal to the
  binary release version by release policy (one tag drives both).

- **CI must prebuild the artifact producers.** Because the publisher does not
  rely on lifecycle scripts, CI explicitly builds `@brika/sdk` `dist/bin/brika.js`
  (`build:bin`) and `create-brika` `dist/index.js` (`build`) before publishing.

## 2. What to publish

### Tier 1: must publish (SDK runtime closure + scaffold), 9 packages

`@brika/sdk`, `create-brika`, `@brika/flow`, `@brika/ui-kit`, `@brika/errors`,
`@brika/grants`, `@brika/ipc`, `@brika/serializable`, and `@brika/testing` (an
optional peer of the SDK backing the `@brika/sdk/testing` author API).

Closure derivation (verified): `sdk -> {errors, grants, ipc}` (declared) +
`sdk -> {flow, ui-kit}` (value imports) + `sdk -> serializable` (type-only, but
required because the SDK ships raw `.ts`). Transitively `grants -> errors`,
`ipc -> errors`, `flow -> serializable`.

### Tier 1 plugins: publish all 7

`@brika/plugin-agent`, `@brika/blocks-builtin`, `@brika/plugin-matter`,
`@brika/plugin-spotify`, `@brika/plugin-timer`, `@brika/plugin-weather`,
`@brika/plugin-sil-electricity`. Each depends only on `@brika/sdk` via
`workspace:*`. They are how the npm-backed store discovers (`keywords:brika`) and
installs (`brika install <name>` runs an npm/bun install) plugins; raw `.ts(x)`
entries are compiled at install/load by `@brika/compiler` (by design).

### Tier 2: publish on a product decision, 2 libraries

`@brika/i18n`, `@brika/i18n-devtools`. Fully decoupled from the SDK closure (zero
`@brika/*` runtime deps). Kept `private: true` for now (not published yet) so that
`private` is the single source of truth for "is it published"; defer until they
have standalone READMEs. To promote: set `private: false` AND add the `!` negation
to the Changesets `ignore` (the `changeset-config` guard test fails until both are
done, so they can never drift apart).

### Tier 3: keep internal (`private: true`)

`analytics, auth, banner, cli, compiler, components, db, di, events, http,
permissions, plugin, registry, remote-access-protocol, router, schema,
type-system` (+ `testing`, dev-only). Every runtime importer is a private app or
another internal lib. The author toolchain (`cli`, `compiler`, `schema`) is
bundled into `dist/bin/brika.js`, so it never enters a plugin's install closure.
`@brika/components` is mislabeled today (its description reads "Private React
components" but `private` is unset): flip it to `private: true`.

**Decisive default: publish the 9 Tier-1 packages + 7 plugins (16 packages),
nothing else.** This shrinks the public contract from 35 to 16.

### Per-package fix list (only for what we ship)

**P0 (correctness, done in PR 1):**
- `packages/sdk/package.json`: `@brika/flow`, `@brika/ui-kit`,
  `@brika/serializable` moved to `dependencies`. Regression test added
  (`published-dependency-closure.test.ts`).
- `packages/create-brika/package.json`: `@brika/cli` moved to `devDependencies`.

**P1 (tarball hygiene, shipped set):**
- Convert each shipped library to a `files[]` allowlist; delete `.npmignore`.
  Canonical negation block (brace globs keep it to three lines; npm + bun pack
  both honor them):
  ```json
  "files": ["src", "README.md", "LICENSE", "CHANGELOG.md",
    "!src/**/*.{test,spec}.{ts,tsx}",
    "!src/**/{*_test-utils.ts,tsconfig.json,*.bench.ts,__benchmarks__/**}",
    "!**/*.tsbuildinfo"]
  ```
- `plugins/matter/package.json`: add the negation block; delete the stray
  `src/pages/tsconfig.json` (it `extends ../../../../tsconfig.json`, path-broken
  once published). Keep `*.brick.ts` / `*.brick.tsx` sidecars (loaded at runtime).

**P2 (metadata, shipped set):**
- `plugins/sil-electricity/package.json`: add `repository`, `homepage`, `bugs`.
- Normalize `repository.url` to the `git+https://...` form (matter uses bare
  `https://...`).
- Optionally copy the root `LICENSE` into each shipped package.

### Plugin gating

Publish all 7. Distinguish official from community via the existing verified
plugins allowlist (`apps/hub/src/runtime/store/verified.ts`, served from
`registry.brika.dev/verified-plugins.json`), not by withholding publication. Add
the 6 first-party plugins (agent, blocks-builtin, matter, spotify, timer,
weather) as `featured`; leave `sil-electricity` published-but-unbadged. Keep the
`@brika/blocks-builtin` name (no `plugin-` prefix): discovery is keyword/engines
based, not name based. Treat `matter` as higher blast radius (it pulls the full
`@matter/*` tree at install).

## 3. Versioning model

**Hybrid via Changesets, platform group kept lockstep with the binary release
line by policy.**

- Platform group (`fixed`): `@brika/sdk` + closure libs (`flow`, `ui-kit`,
  `errors`, `grants`, `ipc`, `serializable`) + `create-brika`. One version line,
  because the SDK re-exports the closure (they are one coupled surface).
- Plugins: independent. A lone plugin fix bumps only that plugin (no empty
  "version-bump-only" entries across the others). When the SDK bumps, plugins
  still cascade because they depend on it: correct, not a fixed group.
- Everything else: deny-by-default `ignore` (Tier-3 libs, private apps, dormant
  Tier-2).

Pure lockstep floods per-package changelogs with empty "version bump only"
entries; fully independent makes the platform compatibility number impossible to
derive. This hybrid keeps the coupled platform a single number while letting each
plugin log only when it actually changes.

**Two-version-source reconciliation:** the running hub's version is
`buildInfo.version` (build-time macro from the binary release version, surfaced
as `needs.setup.outputs.binary_version` in CI), not `package.json` at runtime. So
`engines.brika` must track the binary line. Resolution: by release policy the
Changesets platform-group version equals the binary release version (both
releases run from the same tag), and `sync:engines-brika` derives `^<minor>` from
`binary_version`.

**Coexistence with `bump-version`:** keep `bump-version` for the root/app/binary
line (it feeds the binary build job, the canary base, and the version-monotonic
gate). Changesets owns the 9 libs + 7 plugins and produces their concrete
`^x.y.z` ranges. They reconcile on the shared release tag.

## 4. Changelog system

**Pick: Changesets (`@changesets/cli` + `@changesets/changelog-github` +
`changesets/action`).** Pin a known-Bun-compatible release and verify end to end
against `bun.lock` in a spike (PR 4) before wiring CI (PR 7): Bun support in
Changesets has historically been partial, and the action defaults to npm-style
installs.

Why (scored against this repo): Changesets is the only candidate that delivers
per-package curated-prose changelogs, native `workspace:*` graph propagation
(bump `@brika/sdk` and it auto-bumps the dependents and rewrites their internal
ranges to concrete versions), and the lockstep/independent hybrid via `fixed`
groups. release-please attributes by file path, but this repo squash-merges with
PR-numbered, area-scoped subjects, so per-package attribution is lossy. git-cliff
has no version or dep-graph awareness.

Use `changeset version` to mutate manifests (rewriting `workspace:*` to concrete
ranges), then `npm publish --provenance` those manifests. Do not use
`changeset publish` (it shells `npm publish` with its own semantics; we want the
toposorted, idempotent, provenance publisher in `packages/workspace-tools/src/release-libs.ts`).

`.changeset/config.json`:
```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "brikalabs/brika" }],
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "fixed": [
    ["@brika/sdk", "@brika/flow", "@brika/ui-kit", "@brika/errors", "@brika/grants", "@brika/ipc", "@brika/serializable", "create-brika"]
  ],
  "ignore": [
    "@brika/*",
    "!@brika/sdk", "!@brika/flow", "!@brika/ui-kit", "!@brika/errors", "!@brika/grants", "!@brika/ipc", "!@brika/serializable",
    "!@brika/plugin-agent", "!@brika/blocks-builtin", "!@brika/plugin-matter", "!@brika/plugin-spotify", "!@brika/plugin-timer", "!@brika/plugin-weather", "!@brika/plugin-sil-electricity"
  ]
}
```

Two design choices keep this maintainable:

- **`ignore` is deny-by-default.** Changesets DOES version a private package when
  it depends (transitively) on a bumped one (a cascade bump), so every
  non-published package would otherwise need to be enumerated, and a newly-added
  internal package would silently cascade-publish-version. Instead we ignore all
  `@brika/*` and un-ignore exactly the published set: the `!` entries ARE the
  published allowlist, a new internal package is ignored by default (safe), and
  `create-brika` (not `@brika`-scoped) plus the dormant `i18n` / `i18n-devtools`
  fall out correctly without extra lines. Verify with `bunx changeset status`
  (it must list exactly the 16). Adding a published package = add one `!` line.

- **Only the platform is a `fixed` group.** The SDK and its runtime closure are
  tightly coupled (the SDK re-exports them), so they version in lockstep; a
  changeset on any one bumps all. Plugins are independent products, so a lone
  plugin fix bumps only that plugin (no empty "version-bump-only" changelog
  entries across the others). When the SDK bumps, plugins still cascade because
  they depend on it: that is correct, not a fixed group.

`engines.brika` does not come from these versions: `sync:engines-brika` derives it
from the binary release line (see Section 3), so independent plugin versions are
fine. `private` is the single source of truth for "is it published," and the
`changeset-config` guard test (`packages/workspace-tools/src/changeset-config.test.ts`)
asserts the `!` negations equal the non-private `@brika/*` packages, so the config
and the package flags can never silently drift. Promote `i18n` / `i18n-devtools`
by setting `private: false` and adding their `!` entries together.

Scripts to add:
```jsonc
"changeset": "changeset",
"version-packages": "changeset version && bun run sync:engines-brika && bun install --lockfile-only",
"release": "bun run packages/workspace-tools/src/release-libs.ts"
```
`sync:engines-brika` rewrites each plugin's `engines.brika` to
`^<binary-release minor>`. `packages/workspace-tools/src/release-libs.ts` reuses the verify-runner gate
plus the `npm-dist.ts` idempotency / order / provenance pattern.

Contributor DX: open a PR, run `bun run changeset` (multiselect auto-selects a
whole `fixed` group, choose bump, write a summary), commit the generated
`.changeset/*.md`. On merge, `changesets/action` opens a "Version Packages" PR
(bumps, rewrites ranges, prepends each `CHANGELOG.md`, runs `sync:engines-brika`).
Merging it on the release tag publishes.

## 5. Publish pipeline (CI)

**Automated (`.github/workflows/release.yml`, Changesets "Version Packages PR"
model).** On every push to `main`, `changesets/action` either opens/updates a
"Version Packages" PR (running `bun run version-packages`: bump versions, write
CHANGELOGs via the GitHub formatter, sync plugin engines, refresh the lockfile)
or, when no changesets remain (the version PR was merged), runs the publish
command. The publish command is `bun run release`
(`packages/workspace-tools/src/release-libs.ts`), NOT `changeset publish`: it
publishes with `npm publish --provenance` (Bun has no `--provenance`/OIDC). It
toposorts the libraries and plugins in ONE idempotent pass
(`errors/grants/ipc/serializable -> flow/ui-kit -> sdk -> create-brika -> the 7
plugins`), so no `publish-libs` / `publish-plugins` split is needed; the manifest
transforms (`workspace:` rewrite, `./internal/*` strip, bundle-exports repoint,
dev-key strip) and idempotent skip-if-published live in the shared
`publish-package.ts`.

After the publish path, `release.yml` tags `v<@brika/sdk version>` (the
fixed-group anchor). The tag must be pushed with a PAT/App token (`RELEASE_PAT`),
because tags pushed by the default `GITHUB_TOKEN` do not start new workflow runs;
the tag then triggers `build.yml` (`is_release=true`) to publish the binary
launcher (`brika` + `@brika/cli-*` via `npm-dist.ts`) and cut the production
GitHub release. The per-push canary stays binary-only (npm versions are
immutable). If `RELEASE_PAT` is unset the libraries still publish; the workflow
warns and the tag is pushed by hand.

`release-packages.yml` remains as a manual `workflow_dispatch` fallback (dry-run
by default) running the same `bun run release`, for the one-time bootstrap and
for recovery. The two cannot conflict (immutable versions + idempotent skip).

Publisher semantics: `npm publish --provenance`; idempotency via
`isPublished(name, version)` (`npm view`); explicit skip-if-published /
continue-on-skip / abort-on-real-error so a partial-failure re-run resumes
cleanly; topological order; dist-tag routing (`*-*` -> `next`); non-interactive.

OIDC one-time setup (manual on npmjs.com): trusted publishing is per package name.
Each name needs the repo `brikalabs/brika`, the workflow filename, and any gating
environment. A trusted publisher cannot be set before the package exists, so the
first publish of each new name uses the `NPM_TOKEN` bootstrap fallback; OIDC takes
over afterward.

## 6. Phased rollout (each an independently shippable PR)

1. **Correctness blockers (this PR).** Promote `flow` / `ui-kit` / `serializable`
   to `dependencies` in `@brika/sdk`; move `@brika/cli` to `devDependencies` in
   `create-brika`; add the SDK dependency-closure regression test.
2. **Shrink the public surface.** Set `private: true` on Tier-3 libs +
   `@brika/components`. Assert no public package has a runtime dependency on a
   private one.
3. **Tarball hygiene.** Convert shipped packages to the canonical `files[]`
   allowlist; delete `.npmignore`; fix matter; normalize `repository.url`; add
   metadata to `sil-electricity`. Verify with `bun pm pack --dry-run`.
4. **Changesets spike + adoption.** Add and configure Changesets; spike-verify
   `changeset version` against `bun.lock`; add scripts and
   `packages/workspace-tools/src/sync-engines-brika.ts` + `packages/workspace-tools/src/release-libs.ts`. No CI yet.
5. **`publish-libs` CI job.** Tagged-gated, OIDC, prebuild, typecheck, toposorted
   idempotent provenance publish. Register trusted publishers for the 9 lib names.
6. **`publish-plugins` CI job + verified badge.** `needs: publish-libs`; verify
   gate; publish the 7 plugins; add the 6 first-party plugins to
   `verified-plugins.json`. Register trusted publishers for the 7 plugin names.
7. **Wire Changesets end to end (shipped: `release.yml`).** The `changesets/action`
   step drives the "Version Packages" PR; merging it runs `bun run release` and
   tags `v<sdk>` (via `RELEASE_PAT`) to trigger the binary release in `build.yml`.
8. **(Deferred) Promote Tier-2.** When `i18n` / `i18n-devtools` get standalone
   READMEs, remove them from `ignore` and register their trusted publishers.

## 7. Already-published packages on npm

Several names are already live on npm (owner: maxscharwath; `@brika` scope owned),
up to `0.3.1`: `create-brika`, `@brika/sdk`, `@brika/compiler`, `@brika/schema`,
`@brika/flow`, `@brika/ui-kit`, `@brika/ipc`, `@brika/serializable`,
`@brika/i18n-devtools` (`0.1.1`), `@brika/plugin-timer`, `@brika/plugin-weather`,
`@brika/blocks-builtin`. The repo is at `0.4.0`, so the first release continues the
line cleanly (no version-number collision).

- **Do not unpublish.** It breaks installs, burns the version number permanently,
  and locks the name for 24h. The names stay yours regardless.
- **`@brika/compiler` + `@brika/schema`** are made `private` here (internalized:
  bundled into the `brika` bin), so they freeze at `0.3.1`. If they have no
  external consumers, `npm deprecate` them with a pointer ("bundled into
  @brika/sdk") rather than unpublishing.
- **`@brika/i18n-devtools`** is at `0.1.1`; keep publishing it (relocating its
  source does not require unpublishing).

## 8. Verification layers (tests)

Three layers guard that the published surface actually installs and runs, fastest
to strongest:

1. **Static** (`published-dependency-closure.test.ts`, `changeset-config.test.ts`):
   per-PR, instant. The SDK runtime closure is in `dependencies`; the Changesets
   allowlist, `PUBLISH_ORDER`, and the `fixed` group all equal the non-private
   published set.
2. **Isolated install** (`closure-install.e2e.integration.test.ts`): per-PR, ~1s,
   Bun-only. `bun pm pack` the SDK closure, `bun install` into a clean consumer via
   `file:` overrides, import the react-free subpaths. Reproduces the
   missing-dependency crash class.
3. **Registry round-trip** (`e2e/acceptance.ts`, gated nightly + dispatch,
   Docker-free): start verdaccio via `bunx`, `bun publish` the shipped surface,
   `bun add` into a clean consumer, AND boot a headless hub that installs
   `@brika/plugin-timer` from the registry and asserts it loads + registers blocks.

## 9. Open decisions for the owner

1. Keep the platform-group version equal to the binary release version (one tag
   drives both)? Recommended: yes (the only way `engines.brika ^<minor>` stays
   correct given the hub version comes from the binary build macro).
2. `engines.brika` shape: `^<minor>` of the binary release? Recommended: yes
   (matches the current `^0.4.0` convention; tighter `~<patch>` drops compatible
   hubs).
3. Publish Tier-2 (`i18n` / `i18n-devtools`) now or defer? Recommended: defer
   until they have standalone READMEs (zero risk to promote later).
4. Keep the `@brika/blocks-builtin` name (immutable once published)? Recommended:
   keep (built-in blocks bundle; discovery is keyword/engines based).
5. `sil-electricity` badge status? Recommended: publish unbadged (community tier).
6. Treat `matter` as higher risk (conservative `@matter/*` pins)? Recommended:
   yes (it pulls tens of MB at install).
