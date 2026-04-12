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
| **Issue detection** | Missing keys, extra keys, missing `{{variables}}` |
| **Coverage stats** | Per-locale, per-namespace translation completeness |
| **Runtime missing keys** | Catches keys missing at runtime via i18next `saveMissing` |
| **Missing key markers** | Toggle red markers directly on the page showing where missing keys render |
| **Key browser** | Search, filter, and inline-edit translations across all locales |
| **Key usage** | See all source files where a translation key is used, click to open in IDE |
| **Inspect mode** | Hover over text in the app to see its i18n key, click to navigate |
| **CI mode** | Toggle raw translation keys in the UI (i18next `cimode`) |
| **Auto-fix** | Copy missing keys from the reference locale or remove extra keys |
| **Click to editor** | Click a runtime marker badge to open the source file in your IDE |
| **Dark mode** | Automatically syncs with your app's theme (`.dark` class, `data-mode`, or system preference) |
| **Plugin support** | Auto-discovers and validates plugin-scoped translations from workspace packages |
| **Type generation** | Auto-generates TypeScript declarations to `node_modules/.cache` on changes |

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `localesDir` | `string` | *required* | Path to the core locale directory |
| `referenceLocale` | `string` | `'en'` | Locale used as ground truth for validation |
| `srcDirs` | `string[]` | `['./src']` | Directories to scan for `t()` call usages (shown in key browser) |

## CLI Scripts

Validate translations from the command line:

```bash
# Validate locale parity (exits non-zero on errors — use in CI)
bun packages/i18n-dev/src/check.ts --locales ./apps/hub/src/locales

# Generate TypeScript type declarations
bun packages/i18n-dev/src/generate-types.ts --locales ./apps/hub/src/locales/en --out ./node_modules/.cache/@brika/i18n-devtools
```

### CI example (GitHub Actions)

```yaml
- name: Check i18n translations
  run: bun packages/i18n-dev/src/check.ts
```

The check script exits with code 1 if there are errors (missing keys, missing namespaces), making it suitable for CI gates. Plugin locales are auto-discovered from the workspace configuration.

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
