# i18n Production-Readiness Checklist

Acceptance criteria for **public release** of `@brika/i18n` and `@brika/i18n-devtools` as standalone packages usable in any React/Vite/Bun project. Each item must be checked before the packages can ship to a public registry.

## 1. Genericity (no brika concepts inside the runtime packages)

- [ ] `grep -r "brika" packages/i18n/src/` returns zero hits (other than package.json + LICENSE headers).
- [ ] `grep -r "brika" packages/i18n-devtools/src/` returns zero hits (other than package.json + LICENSE headers).
- [ ] `grep -r "plugin:" packages/i18n/src/ | grep -v test` returns zero hits.
- [ ] `grep -r "plugin:" packages/i18n-devtools/src/ | grep -v test` returns zero hits.
- [ ] No `@brika/*` workspace dependencies inside `packages/i18n/` and `packages/i18n-devtools/` other than `@brika/i18n` (which `@brika/i18n-devtools` may depend on).
- [ ] Plugin/package discovery glue lives in `apps/ui/` only — never inside the generic packages.
- [ ] No hard-coded namespace prefixes (`plugin:`, `package:`) anywhere in the dev tool's defaults.

## 2. Type safety (user's stated rules)

- [ ] Zero `as` casts. `grep -nE "\bas [A-Za-z]" packages/i18n*/src/` returns zero results, OR every remaining cast carries an inline justification comment.
- [ ] Zero `: any`, `as any`. `grep -nE "any" packages/i18n*/src/` returns zero results outside string literals + test fixtures.
- [ ] Zero `@ts-expect-error` and `@ts-ignore` without a one-line justification.
- [ ] Every `typeof x === '…'` chain validating untyped data is replaced with a zod schema.
- [ ] Every React component has `Readonly<>` props (SonarQube S6759).
- [ ] No `unknown` reaching consumer code — every boundary type fully narrowed.

## 3. Security

- [ ] Path traversal: `locale`/`namespace` URL params + HMR payloads reject `..`, `/`, `\` via `/^[A-Za-z0-9_.@:+-]+$/` (or stricter).
- [ ] Symlink safety: `writeSourceKey` `realpath`-checks the target against allowed roots (`localesDir` + plugin roots).
- [ ] Origin/Referer enforcement on every dev-server state-changing endpoint (`/__open-in-editor`, `/__i18n-write`).
- [ ] No `Access-Control-Allow-Origin: *` on SSE responses — uses the per-origin allowlist.
- [ ] Prototype pollution: `setNestedValue` rejects `__proto__`/`constructor`/`prototype` at every depth AND loaded JSON is deep-scanned at load time.
- [ ] Hub i18n write endpoints behind both `requireAuth()` AND a scope check (e.g. `Scope.ADMIN_ALL`).
- [ ] Proxy hygiene: `x-forwarded-for`, `x-real-ip`, `forwarded` not forwarded from the browser to the upstream hub.
- [ ] CSRF: state-changing endpoints check `Origin === Host` OR require a token.
- [ ] No exported getters expose raw stack-trace data (`getRuntimeUsages` / `trackedTranslations`) outside the dev overlay bundle.
- [ ] No `__SECRET_INTERNALS_DO_NOT_USE` / `__CLIENT_INTERNALS` / `_debugSource` / `__reactFiber$…` access. Use public APIs only.
- [ ] Editor command spawn uses `execFile` (no shell) AND the file path is `realpath`-bounded to the workspace.

## 4. Architecture & file size

- [ ] No file in `packages/i18n*/src/` exceeds 300 LOC without a documented reason.
- [ ] Each module has a single clear responsibility.
- [ ] Module-scoped mutable state encapsulated in classes or closures — not module-level `let`.
- [ ] No monkey-patching of library globals (`i18next.t = …`). Use library plugin APIs.
- [ ] Adding a new translation source / IDE integration / build target requires one new file, not edits across many.

## 5. API surface

- [ ] One canonical type per concept (no `srcDirs`/`ScanRoot`/`sources`/`scanRoots` overlap).
- [ ] `defaultNamespace` disambiguated — same name never means three different things.
- [ ] Public exports minimal and intentional. No re-exports of internal helpers.
- [ ] Every public function/class has a JSDoc with at least: purpose, params, return shape, error conditions, example.
- [ ] No breaking changes between versions without a CHANGELOG entry and major bump.

## 6. Tests

- [ ] Unit test coverage ≥85% in both packages.
- [ ] Integration tests for the React Suspense flow (loading state, namespace pre-population, language switch).
- [ ] Integration tests for the Vite plugin (HMR translation save, scan-on-change, validation).
- [ ] Security regression tests:
  - [ ] Path-traversal attempt is rejected (`../../etc/passwd` shaped payloads)
  - [ ] Prototype-pollution attempt is rejected (`__proto__` segments)
  - [ ] Symlink under `locales/` is rejected before write
  - [ ] Cross-origin request to `/__open-in-editor` is 403'd
- [ ] All tests pass under `bun test` in both packages.

## 7. Documentation

- [ ] `README.md` in `packages/i18n/` — overview, install, quick-start, API table, link to API reference.
- [ ] `README.md` in `packages/i18n-devtools/` — same shape, plus screenshots/animated GIF of the overlay (or note pointing at a demo).
- [ ] `CHANGELOG.md` in both — starting with `## 0.1.0 — Initial public release`.
- [ ] `LICENSE` (MIT) in both, matching the workspace root LICENSE.
- [ ] API reference page in `apps/docs/api-reference/` for both packages.
- [ ] Migration notes for users upgrading from any prior version (if applicable).
- [ ] At least one working example — either an `examples/` folder in the package or an external repo linked from the README.

## 8. Packaging

- [ ] `package.json` `exports` field is exhaustive and correct (`.`, `./node`, `./react`, etc.).
- [ ] `package.json` `types` / `typesVersions` exposes `.d.ts` files for every export.
- [ ] `package.json` `peerDependencies` listed for all expected peers (`i18next`, `react`, `vite`, …) with appropriate version ranges.
- [ ] `peerDependenciesMeta` marks optional peers correctly.
- [ ] `package.json` `files` field limits the published tarball.
- [ ] `package.json` includes `repository`, `homepage`, `bugs`, `license`, `keywords`, `sideEffects`.
- [ ] No `workspace:*` deps in the published metadata — replaced with concrete semver ranges before publish.
- [ ] Semver discipline: `0.x.y` for pre-1.0, breaking change = major bump from `1.0.0` onward.

## 9. Performance

- [ ] No O(N²) operations in hot paths (`t()` calls, scan walks, store updates).
- [ ] React hooks memoise stable references (`getSnapshot` returns same reference until data changes).
- [ ] Lazy-loading is the default; eager preload requires opt-in.
- [ ] No memory leaks: every subscriber has a documented unsubscribe path.
- [ ] MutationObserver / EventSource / file watchers cleaned up on dispose.
- [ ] Production bundles strip the dev overlay and the i18n-devtools entry.

## 10. Developer experience

- [ ] Errors carry actionable messages with the offending file/path/key included.
- [ ] TypeScript types fully accurate — no `unknown` leaking to consumer code.
- [ ] Plugin discovers misconfigurations at server start, not at runtime.
- [ ] HMR works reliably: edits in any source produce a corresponding overlay update within 500 ms.
- [ ] Click-to-IDE works for all three classes of source: host app code, workspace packages, bundled plugin code.

## 10a. Plug-and-play install & first-run

Goal: a developer cloning a fresh Vite + React + i18next project should have working translations + the dev overlay in **under 5 minutes**.

- [ ] **One-shot install:** `bun add @brika/i18n @brika/i18n-devtools` (plus required peers documented in a single copy-paste block).
- [ ] **Zero-config defaults:** `createI18n()` with no options must produce a working setup against a conventional layout (`./src/locales/<lang>/<ns>.json`).
- [ ] **Single import per use case:**
  - App bootstrap: `import { createI18n } from '@brika/i18n/react';`
  - In a component: `import { useLocale } from '@brika/i18n/react';`
  - Vite config: `import { i18nDevtools } from '@brika/i18n-devtools/vite';`
  - Nothing else required.
- [ ] **Quick-start snippet in the README is ≤ 15 lines** and produces a working "hello world" translation.
- [ ] **`i18nDevtools()` works with no args** when `localesDir` is conventional. Optional `hub:` / `apiUrl:` for hub-backed setups.
- [ ] **Sensible error messages on common misconfigurations:**
  - No `localesDir` set AND no `apiUrl` → clear error pointing at both options.
  - `localesDir` doesn't exist → error names the resolved path and suggests creating it.
  - JSON parse failure → error includes file path + parse-error location.
  - `useTranslation` without `Suspense` boundary → error explains the contract.
- [ ] **No peer-dep warnings on a fresh install** with the documented peer list.
- [ ] **`brika-i18n` CLI bin works without flags** (printing usage / running validation against `./src/locales` by default).
- [ ] **Type inference works out of the box:** `t('common:foo')` autocompletes (once an `i18n-resources.d.ts` is generated).
- [ ] **Suspense boundary requirement is documented at the entry point**, not a surprise at runtime.
- [ ] **Demo / example project** at `examples/vite-react/` (or linked external repo) runnable with one command: `cd examples/vite-react && bun install && bun dev`.
- [ ] **First-run wizard / scaffolder** (stretch): `bun x @brika/i18n-devtools init` writes `vite.config.ts` + `lib/i18n.ts` + a starter `src/locales/en/common.json`.

## 10b. Editor & tooling DX

- [ ] **JSDoc on every public symbol** with @example blocks for non-obvious APIs.
- [ ] **TypeScript autocompletion** reveals all option shapes — no `Record<string, unknown>` reaching consumer types.
- [ ] **Generated `i18n-resources.d.ts`** is committed via the dev plugin, no extra step.
- [ ] **Overlay shortcuts** documented in the overlay header (e.g. `Cmd+K` to focus, `Esc` to close).
- [ ] **Per-package `README.md`** has a table of contents and links the rest of the docs.
- [ ] **CI badge in each README** (build/test/coverage).

## 11. Compliance & legal

- [ ] No code copied from incompatible-license sources.
- [ ] Third-party dependencies' licenses noted (audit via `bun pm ls --licenses` or similar).
- [ ] No personally identifiable information in build outputs (`__cs` paths are workspace-relative, never absolute machine paths in production builds).
- [ ] Telemetry: zero — packages do not phone home.

## 12. Release engineering

- [ ] CI workflow runs typecheck + tests + lint on every PR for the two packages.
- [ ] `bun pm pack` produces a tarball that installs cleanly into an empty Vite+React project.
- [ ] Tested on at least one downstream consumer outside brika (the workspace itself counts if isolated).
- [ ] Git tag created at release time matches the `package.json` version.

---

## Tracking

Update this checklist as items are completed during the 4-cycle refactor. The PR description must reference this file and confirm each section is green before merge.
