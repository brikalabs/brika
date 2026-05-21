# Changelog

All notable changes to `@brika/i18n-devtools` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Generated type augmentation now actually merges.** Switched from module
  augmentation (`declare module '@brika/i18n/registry'`) to **global namespace
  augmentation** (`declare global { namespace BrikaI18n { interface Namespaces } }`).
  Module augmentation only works when the augmenting file can resolve the
  augmented module specifier — and files generated into
  `node_modules/.cache/` cannot walk up to `node_modules/@brika/i18n`, so the
  merge silently failed and every `t()` call fell through to the broad-string
  overload. The global form dodges module resolution entirely: any `.d.ts`
  in the compilation graph, anywhere on disk, merges into the same
  `BrikaI18n.Namespaces` interface.
- **Generated `.d.ts` now ends with `export {};`** so TypeScript treats it as
  a module — required for `declare global { ... }` to take effect (in a
  non-module file the block is a redundant top-level reopening, not an
  augmentation).
- **Sanitised interface names** in `i18n-resources.d.ts`. The generator
  previously emitted `Plugin:@brika/blocksBuiltinNs` for namespaces like
  `plugin:@brika/blocks-builtin`, which is a TypeScript syntax error.
  `toTypeName()` now strips characters that aren't valid in TS identifiers.

### Added

- **`typesDir` plugin option** — overrides where the Vite plugin writes the
  generated augmentation files. Defaults to
  `'node_modules/.cache/@brika/i18n-devtools'`.

### Changed

- **Renamed `hub` option to `remote`** — framework-agnostic naming for the
  HTTP-served translation source. `apiUrl` is unchanged and still derives
  from `remote` (or overrides it explicitly for non-default API paths). No
  back-compat shim — update consumers in place.
- **Relaxed the "required option" rule.** Filesystem-only setups are now
  first-class: pass any one of `localesDir`, a `sources` entry with its own
  `localesDir`, or `remote`/`apiUrl` and the plugin works. The old contract
  required `localesDir` or `apiUrl` specifically — `sources`-only setups
  needed a workaround.
- **Union-based validation.** The total per-namespace key set is now the union
  of leaf keys across every locale — no locale is privileged as ground truth.
  A key present in `fr/` but missing from `en/` now surfaces as a `missing-key`
  *error* against EN instead of an `extra-key` *warning* against FR. Coverage
  percentages are symmetric across all locales.
- `referenceLocale` is now a **display hint only** (overlay column order,
  preferred locale for "Copy" auto-fix). It no longer gates validation
  outcomes.
- `extra-key` issue type removed — it can no longer be emitted under union
  semantics.
- `generateNamespaceList(nsNames, defaultNamespace = 'translation')` —
  hardcoded `'common'` removed; consumers configure the default via
  `defaultNamespace` (defaults to i18next's built-in `'translation'`).
- CLI defaults updated to be project-agnostic: `--locales` defaults to
  `${cwd}/src/locales`, `--reference-locale` accepts any locale code,
  `generate-types` accepts `--reference-locale` + `--default-namespace`
  flags.

### Added

- `Plugin Options` `sources: SourceConfig[]` — replaces the old `srcDirs[]`
  with a unified shape that can carry an optional namespace prefix per source
  tree.
- `defaultNamespace` plugin option (defaults to `'translation'`).
- Overlay surfaces missing-namespace and missing-variable issues with locale
  badges. Auto-fix now falls back to any locale that has the key when the
  reference doesn't.
- README documents union semantics in the feature table + CLI section.

### Security

- Same-origin enforcement on `/__open-in-editor` and `/__i18n-write`
  (rejects when both `Origin` and `Referer` headers are absent).
- `/__open-in-editor` is POST-only (405 on other methods).
- Save-handler payload schema tightens `key` (≤256 chars) and `value`
  (≤10 000 chars), and rejects unsafe key segments at every depth.

### Removed

- Internal duplicate `detectFileIndent` in `i18n-dev/src/server/save-handler.ts`
  — uses `@brika/i18n/node`'s shared implementation.
- Brand-leak in CLI defaults (`apps/hub/src/locales`) — replaced with generic
  cwd-relative defaults.

## [0.1.0] — 2026-05-21

Initial public-shape release. Vite plugin + React overlay + CLI, framework-agnostic.
