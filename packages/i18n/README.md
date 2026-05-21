# @brika/i18n

A framework-agnostic i18n runtime: translation registry, deep-merge loaders, React hooks with Suspense, and an SSE live-update path. Works in any **React + Vite + Bun** project — no brika-specific concepts in the runtime.

## Why

i18next is excellent, but its bootstrap is verbose, its types stop at the namespace boundary, and there's no idiomatic "fetch the bundle for this language and re-render" primitive. `@brika/i18n` is a thin layer on top that gives you:

- A typed `TranslationRegistry` with structural events (add / update / remove namespace).
- Pure loaders (`flatten`, `deepMerge`, `mergeFallbackChain`, `buildFallbackChain`) usable from server, client, or test.
- A React entry (`@brika/i18n/react`) that bundles i18next, the language detector, and a Suspense-aware `switchLanguage()`.
- A Node entry (`@brika/i18n/node`) for filesystem loaders, watchers, and workspace package discovery.
- A `registry` entry (`@brika/i18n/registry`) that downstream tooling augments to deliver end-to-end-typed translation keys.

The runtime is **completely brika-free** — you can install it standalone in any React/Vite project and the API never mentions plugins, workspaces, or any brika concept.

## Install

```bash
# bun
bun add @brika/i18n i18next react-i18next zod

# npm
npm install @brika/i18n i18next react-i18next zod

# pnpm
pnpm add @brika/i18n i18next react-i18next zod
```

Peer dependencies: **react ≥18**, **i18next ≥23**, **react-i18next ≥14**, **zod ≥4**. The `i18next-browser-languagedetector` peer is **optional** — install it when you want browser language auto-detection.

## Quick start

### React (browser)

```ts
// app/i18n.ts
import { createI18n } from '@brika/i18n/react';

await createI18n({
  defaultLocale: 'en',
  fallbackLocale: 'en',
  defaultNamespace: 'common',
  // Loader can hit your hub, an /api/i18n endpoint, or a static JSON URL.
  loadBundle: async (locale) => {
    const res = await fetch(`/api/i18n/bundle/${locale}`);
    return res.json();
  },
});
```

```tsx
// app/main.tsx
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';

createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18next}>
    <App />
  </I18nextProvider>
);
```

```tsx
// any component
import { useTranslate } from '@brika/i18n/react';

function Hello() {
  const { t, locale, changeLocale } = useTranslate();
  return (
    <>
      <h1>{t('common:greeting', 'Hello')}</h1>
      <button onClick={() => changeLocale('fr')}>FR</button>
    </>
  );
}
```

`useTranslate()` is cheap (translation only). For formatters and locale display names, use `useIntl()`. The `useLocale()` façade composes both for code that needs everything.

### Node / Bun (server)

```ts
import { loadLocaleFolder, discoverPackageLocales, findWorkspaceRoot } from '@brika/i18n/node';

// Read one locale folder: { [namespace]: data }
const en = await loadLocaleFolder('./src/locales/en');

// Discover every workspace package that ships a `locales/` directory
const root = await findWorkspaceRoot(process.cwd());
if (root) {
  const entries = await discoverPackageLocales(root);
  for (const { namespace, locales } of entries) {
    // wire `locales` (Map<locale, TranslationData>) into your bundle endpoint
  }
}
```

### Registry (advanced)

`TranslationRegistry` is the in-memory store every loader ends up writing to. Use it directly when you want fine-grained events (add / update / remove namespace), incremental loading, or to compose multiple sources into one bundle.

```ts
import { TranslationRegistry } from '@brika/i18n';

const registry = new TranslationRegistry({ defaultLocale: 'en', fallbackLocale: 'en' });
registry.setNamespaceLocale('common', 'en', { greeting: 'Hello' }, { merge: false });
registry.setNamespaceLocale('common', 'fr', { greeting: 'Bonjour' }, { merge: false });

const text = registry.t('fr', 'common:greeting'); // 'Bonjour'

const unsubscribe = registry.onChange((change) => {
  console.log(change); // { kind: 'set', namespace, locale, source? }
});
```

See [`examples/registry-basics.ts`](./examples/registry-basics.ts) and [`examples/react-setup.tsx`](./examples/react-setup.tsx) for runnable examples.

## Concepts

| Concept | Description |
|---|---|
| **Namespace** | Top-level bucket of translations (`common`, `dashboard`, `permissions`). Each namespace is loaded independently; you can lazy-load on route change. |
| **Locale** | Language code (`en`, `fr`, `en-US`). `buildFallbackChain('fr-CA')` returns `['fr-CA', 'fr', 'en']` automatically. |
| **Fallback chain** | Computed at lookup time, not at load. Missing keys fall through to the parent locale, then the configured `fallbackLocale`. |
| **Registry events** | Subscribers receive structural deltas — useful for re-rendering or for the dev overlay's HMR layer. |
| **Deep merge** | Loaders merge nested JSON files into a single `TranslationData` tree per namespace. Multiple files per locale folder are flat-merged. |

## Exports

| Entry point | Purpose |
|---|---|
| `@brika/i18n` | Isomorphic core: `TranslationRegistry`, `translate`, `flatten`, `deepMerge`, `buildFallbackChain`, `interpolate`, plural helpers, plus types. |
| `@brika/i18n/react` | `createI18n`, `useTranslate`, `useIntl`, `useLocale`, `switchLanguage`, `prefetchBundle`, `reloadTranslations`. |
| `@brika/i18n/node` | `loadLocaleFolder`, `loadMergedLocaleFolder`, `watchLocaleSource`, `findWorkspaceRoot`, `discoverPackageLocales`, `PackageJsonSchema`, `detectFileIndent`, `detectIndentFromContent`. |
| `@brika/i18n/registry` | Module-augmentation entry for declaration-merged namespace types generated by `@brika/i18n-devtools`. |

## Typed keys (with `@brika/i18n-devtools`)

Install [`@brika/i18n-devtools`](../i18n-dev) and run the type generator:

```bash
bun x brika-i18n generate-types --locales ./src/locales/en
```

The generated `.cache/@brika/i18n-devtools/i18n-registry.d.ts` augments `@brika/i18n/registry`, giving you end-to-end-typed `t('common:greeting')` autocompletion + typo detection.

## Security

- All JSON loads sanitize prototype-pollution segments (`__proto__`, `constructor`, `prototype`) before reaching the registry.
- `setNestedValue` rejects unsafe dot-path segments at every depth.
- No `as` casts, no `any`. Every external input — JSON content, HMR payloads, registry mutations — is narrowed via type guards or zod schemas.

## License

[MIT](./LICENSE) © Maxime Scharwath
