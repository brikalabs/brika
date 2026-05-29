# i18n Pipeline

Translations come in two halves: a runtime (`@brika/i18n`) that resolves keys at request time, and a build pipeline (`@brika/i18n-dev`) that extracts variables, generates types, and powers a dev-mode overlay.

Key files:

* `packages/i18n/` — runtime registry, interpolation, plural rules.
* `packages/i18n-dev/` — Vite plugin + extractor + middleware.
* `packages/compiler/src/plugins/i18n-call-site.ts` — call-site injection into compiled bundles.

## Runtime

```ts
const { t } = useLocale();

t('devices.title');             // returns the string for the active locale
t('devices.found', { count: 3 });  // interpolates {{count}}
```

The runtime maintains a registry of `locale → namespace → key → value`. Lookups are O(1) via a flattened internal map. Missing keys fall back to the default locale; missing in both returns the key as-is so the UI degrades gracefully.

Interpolation uses double-braced placeholders: `{{name}}`. Pluralisation uses Intl.PluralRules.

## Sources

Plugins ship `src/i18n/<locale>.json` files. The hub's i18n API exposes them via `/api/i18n/{locales,namespaces,bundle/:locale,sources}`. The UI fetches bundles on demand and caches them.

## Build extraction

`@brika/i18n-dev` walks the plugin's source at build time and extracts:

* Every `t('key', vars?)` call site.
* The set of variables interpolated for each key (from the second argument).
* The source location (file + line) of each call.

The output:

1. **Generated types** — TypeScript types so `t('devices.found', { count: 3 })` is type-checked. Missing variable → compile error; wrong variable → compile error.
2. **Coverage report** — keys defined but not used, keys used but not defined.

## HMR for translations

The Vite plugin watches `src/i18n/*.json`. On change, it sends an HMR update to the dev server which patches the runtime registry without a full page reload.

## Dev-mode overlay

In dev builds, the `i18n-call-site` compiler plugin rewrites:

```ts
t('devices.title')
```

into

```ts
t('devices.title', { __cs: 'src/pages/devices.tsx:42' })
```

The dev overlay reads `__cs` from the runtime trace and lets the developer click "open in editor" to jump to the source. In production builds the plugin is disabled and `__cs` is stripped — the runtime ignores extra fields it doesn't recognise.

The overlay also includes a "translate this key" mode: click any string in the UI, see the key, edit the translation in place, save back to the JSON source.

## File serving in dev

The hub serves dev-only endpoints `/api/i18n/sources/:namespace/:locale` that read and write the actual JSON files (in dev mode) so the overlay's save feature can persist. Disabled in production.

## Plugin manifest integration

A plugin opts in via:

```json
"brika": {
  "i18n": { "defaultLocale": "en" }
}
```

The hub picks up `src/i18n/*.json` (in dev) or `locales/*.json` (in production, compiled bundles).

## See also

* **[Internationalization (plugins)](../plugins/i18n.md)** — author-facing.
* **[Compiler](compiler.md)** — `i18n-call-site` plugin context.
