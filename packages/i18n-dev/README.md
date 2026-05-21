# @brika/i18n-devtools

Developer tools for i18n translation validation. Ships a **Vite plugin** that injects a React overlay into your app and a **CLI** for CI checks.

## Requirements

- **Vite** 5+ (or 7+)
- **React** 18+
- **i18next** 23+
- **Tailwind CSS** 4+ with `@tailwindcss/vite`

## Installation

```bash
# npm
npm install -D @brika/i18n-devtools

# pnpm
pnpm add -D @brika/i18n-devtools

# bun
bun add -d @brika/i18n-devtools
```

## Setup

### 1. Add the Vite plugin

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { i18nDevtools } from '@brika/i18n-devtools/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    i18nDevtools({
      localesDir: './src/locales',
      // referenceLocale: 'en',   // default: 'en'
    }),
  ],
});
```

**That's it.** No Tailwind config changes, no CSS imports, no provider wrappers. The plugin auto-injects the overlay during `vite dev` and runs inside an isolated Shadow DOM so it won't affect your app's styles.

Plugin translations from workspace packages are **auto-discovered** — any workspace package with a `locales/` directory is scanned automatically.

### 2. Expected locale structure

```
src/locales/
├── en/
│   ├── common.json
│   └── dashboard.json
└── fr/
    ├── common.json
    └── dashboard.json
```

Each locale is a directory named by its language code, containing one JSON file per namespace.

### 3. Open the overlay

Press **Shift + Alt + D** or click the floating badge in the bottom-right corner.

## Features

| Feature | Description |
|---------|-------------|
| **Union-based validation** | The total key set per namespace is the union of leaf keys across **every** locale — no locale is privileged as ground truth. A key in `fr/` that `en/` forgets is flagged as missing in EN, not as “extra” in FR. |
| **Coverage stats** | Per-locale, per-namespace completeness measured against the union total — symmetric across all locales. |
| **Runtime missing keys** | Catches keys missing at runtime via i18next `saveMissing` |
| **Missing key markers** | Toggle red markers directly on the page showing where missing keys render |
| **Key browser** | Search, filter, and inline-edit translations across all locales |
| **Key usage** | See all source files where a translation key is used, click to open in IDE |
| **Inspect mode** | Hover over text in the app to see its i18n key, click to navigate |
| **CI mode** | Toggle raw translation keys in the UI (i18next `cimode`) |
| **Auto-fix** | Copy missing keys from any locale that has them (reference locale preferred for display order) |
| **Click to editor** | Click a runtime marker badge to open the source file in your IDE |
| **Dark mode** | Automatically syncs with your app's theme (`.dark` class, `data-mode`, or system preference) |
| **Plugin support** | Auto-discovers and validates plugin-scoped translations from workspace packages |
| **Type generation** | Auto-generates TypeScript declarations to `node_modules/.cache` on changes |

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `localesDir` | `string` | *required* | Path to the core locale directory |
| `referenceLocale` | `string` | `'en'` | Display-language hint for the overlay (preferred locale for "Copy" auto-fix and diff column ordering). Has no effect on which issues are emitted — validation is symmetric across all locales. |
| `defaultNamespace` | `string` | `'translation'` | i18next default namespace; placed first in the generated `i18n-namespaces.ts`. |
| `sources` | `SourceConfig[]` | `[{ dir: './src' }]` | Source trees scanned for `t()` call usages. Each entry can pin a namespace so bare-key calls in that subtree resolve correctly. |

## CLI Scripts

Validate translations from the command line:

```bash
# Validate locale parity using union semantics
# (exits non-zero on errors — use in CI; pass --ci to also fail on warnings)
bun packages/i18n-devtools/check --locales ./src/locales

# Generate TypeScript type declarations from the reference locale
bun packages/i18n-devtools/generate-types \
  --locales ./src/locales/en \
  --reference-locale en \
  --out ./node_modules/.cache/@brika/i18n-devtools
```

The validator reports:

- **`missing-key`** (error) — any locale lacks a key that exists in another locale (this includes the reference locale itself, so EN-forgot-FR-has cases are surfaced).
- **`missing-namespace`** (error) — a locale doesn't ship a namespace that another locale defines.
- **`missing-variable`** (warning) — a locale's translation omits an interpolation `{{var}}` that other locales declare for the same key.

### CI example (GitHub Actions)

```yaml
- name: Check i18n translations
  run: bunx @brika/i18n-devtools check --ci
```

The check script exits with code 1 if there are errors (missing keys, missing namespaces). With `--ci`, warnings (missing variables) are also fatal. Workspace package locales are auto-discovered from the monorepo `package.json` `workspaces` field.

See [`examples/`](./examples) for:

- [`vite-plug-and-play.ts`](./examples/vite-plug-and-play.ts) — minimal `vite.config.ts` you can copy into a fresh project.
- [`ci-check.sh`](./examples/ci-check.sh) — drop-in CI step for validating locale parity.

## Exports

| Entry point | Description |
|-------------|-------------|
| `@brika/i18n-devtools` | Core utilities: `scanLocaleDirectory`, `scanPluginLocales`, `findWorkspaceRoot`, `discoverPluginRoots`, `extractKeys`, `extractVariables`, `validateLocales` |
| `@brika/i18n-devtools/vite` | Vite plugin: `i18nDevtools()` |
| `@brika/i18n-devtools/overlay` | React overlay component (auto-injected by the plugin) |

## How it works

1. The Vite plugin discovers workspace packages with `locales/` directories by reading the monorepo `package.json` workspaces config
2. Core and plugin locale directories are scanned on startup and on every JSON file change
3. Validation results and full translation data are pushed to the client via HMR
4. The overlay mounts in an isolated **Shadow DOM** — its Tailwind CSS build cannot leak into your app
5. All locale data is preloaded into i18next regardless of your lazy-loading config, so the overlay always has complete data
6. Runtime missing keys are captured via i18next's `missingKey` event and shown in real-time
7. TypeScript declarations are auto-generated to `node_modules/.cache/@brika/i18n-devtools/` on every scan
