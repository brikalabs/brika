/**
 * Source tree that the dev plugin scans for translation-key usage.
 *
 * Each source declares a directory plus the namespace that bare `t('key')`
 * calls inside it implicitly belong to. The dev tool stays agnostic of how
 * the host's translation registry is structured — the host (consuming app)
 * supplies the per-tree namespace, including any prefix conventions like
 * `plugin:<pkg>` or `package:<id>`.
 *
 * Two locale-folder layouts are supported, picked by whether `namespace` is set:
 *
 *   • **Merged layout** (`namespace` set) — every `*.json` under `<localesDir>/<locale>/`
 *     is deep-merged into one bag and exposed under that single `namespace`.
 *     Standard for workspace packages where one package owns one namespace.
 *
 *   • **Per-file layout** (`namespace` omitted) — each `*.json` becomes its own
 *     namespace named after the file basename (`auth.json` → `auth`). Use this
 *     when the source serves many namespaces from a single locales folder (e.g.
 *     a host app whose runtime exposes one namespace per file).
 */
export interface SourceConfig {
  /** Absolute path to the source directory to scan for `t()` calls. */
  readonly dir: string;
  /**
   * Namespace prefix for bare-key calls inside this source tree. Pass the
   * caller's prefix verbatim (e.g. `plugin:@scope/foo`) — the dev tool does
   * not interpret it. Omit to opt into the per-file locale layout described
   * on `SourceConfig`.
   */
  readonly namespace?: string;
  /**
   * Locale directory that this source's translations live under. When set,
   * the directory is scanned by the validator and watched for changes.
   */
  readonly localesDir?: string;
}

/** Options for the i18n dev Vite plugin. */
export interface I18nDevPluginOptions {
  /**
   * Local locale directory to scan (e.g. `'./src/locales'`).
   *
   * Relative paths resolve against the Vite project root. Absolute paths are
   * used as-is. Combine with `sources` when locale files live in multiple
   * trees (workspace packages, plugins) — the plugin unions them all into
   * one validation surface.
   */
  readonly localesDir?: string;
  /**
   * URL of a running server that serves translation bundles over HTTP. The
   * plugin fetches `${remote}/bundle/:locale` at dev time and folds the
   * response into the union so the overlay can validate against what the
   * deployed server actually serves.
   *
   * Use this for sources the dev plugin can't see by walking the filesystem
   * — runtime-installed plugins, CMS-backed translations, or a remote
   * staging server. For projects whose translations live entirely in the
   * workspace, omit this and rely on `localesDir` + `sources`.
   *
   * The plugin sends an `Origin: <vite-host>` header so the server can
   * recognise dev-tool traffic if it cares to.
   */
  readonly remote?: string;
  /**
   * Override the resolved API base URL. When set, this string is used
   * verbatim instead of deriving from `remote`. Useful when the server
   * mounts the bundle API under a non-default path (e.g.
   * `'https://staging.example.com/i18n'`).
   */
  readonly apiUrl?: string;
  /**
   * Display-language hint shown in the overlay's diff view (default: `'en'`).
   * Has no effect on which issues are emitted — validation is symmetric
   * across all locales (union-based).
   */
  readonly referenceLocale?: string;
  /**
   * i18next default namespace — used by the generated `i18n-namespaces.ts`
   * to place this name first regardless of where it sorts. Defaults to
   * `'translation'` to match i18next's own default.
   */
  readonly defaultNamespace?: string;
  /**
   * Source trees scanned for translation-key usages (`t('key')` calls) and
   * — when an entry sets `localesDir` — additional locale files. Defaults to
   * `[{ dir: './src' }]` relative to the Vite root.
   *
   * Pair with the `@brika/i18n/node` `discoverNamespacedSources()` helper to
   * auto-discover monorepo packages and plugins; the host (consuming app)
   * passes the resulting `SourceConfig[]` here verbatim.
   */
  readonly sources?: ReadonlyArray<SourceConfig>;
  /**
   * Where the generated TypeScript augmentation files land (resource shapes,
   * namespace list, registry augmentation). Resolved relative to the Vite
   * project root. Defaults to `'node_modules/.cache/@brika/i18n-devtools'`.
   * The augmentation targets the global `BrikaI18n.Namespaces` interface, so
   * any `.d.ts` in the compilation graph picks it up regardless of location
   * — the consumer just needs one `/// <reference path="..." />` line in a
   * `vite-env.d.ts`-style file.
   */
  readonly typesDir?: string;
  /**
   * Namespace prefixes the host applies at runtime that the static scanner
   * doesn't reproduce. For brika's `tp(pluginId, key)` wrapper, pass
   * `['plugin:']` — the runtime stores `tp('@brika/foo', 'k')` under namespace
   * `'plugin:@brika/foo'` but the scanner reports `'@brika/foo:k'`. Without
   * this option every `tp()` call surfaces as a spurious `unknown-key`.
   *
   * Default: `[]` — generic projects with no host-side prefix.
   */
  readonly tpNamespacePrefixes?: ReadonlyArray<string>;
  /**
   * Skip `dead-key` warnings for locale namespaces served from sources the
   * static scanner can't see — e.g. brika's runtime-installed plugins land
   * under `'plugin:'` namespaces in the hub bundle but their source code
   * isn't in the workspace, so every key would otherwise show up as dead.
   *
   * Default: `[]`.
   */
  readonly deadKeyIgnoreNamespaces?: ReadonlyArray<string>;
  /**
   * Severity for the two code↔locale cross-checks. Set to `'off'` to silence
   * a check entirely — useful when a project has too many dynamic-key
   * patterns the static scanner can't see (e.g. CMS-backed keys) and the
   * resulting noise drowns out the real signal. Defaults: `'error'` for
   * `unknownKey`, `'warning'` for `deadKey`.
   */
  readonly unknownKeySeverity?: 'error' | 'warning' | 'off';
  readonly deadKeySeverity?: 'error' | 'warning' | 'off';
}

export interface ValidationIssue {
  type:
    | 'missing-key'
    | 'missing-namespace'
    | 'missing-variable'
    /**
     * Code calls `t('ns:key')` but `key` doesn't exist in any locale under
     * `ns`. Either a typo in code, a key removed from locales without the
     * call site being updated, or a missing translation entry. `severity:
     * 'error'` — the runtime lookup will fall through to the default value
     * or the broken-key marker.
     */
    | 'unknown-key'
    /**
     * A locale declares a key that no `t()` / `tp()` call in the scanned
     * source uses. Either a stale translation or a dynamic-key path the
     * static scanner can't see (`t(\`prefix:${dynamic}\`)`). `severity:
     * 'warning'` — usually safe to delete after a manual check.
     */
    | 'dead-key'
    /**
     * Internal failure of the dev plugin itself (failed scan, failed type
     * generation, watcher crash, etc.) — distinct from translation-content
     * issues so the overlay can surface infrastructure breakage without it
     * being mistaken for missing keys. Carries the failure detail in
     * `detail` (the `key` field stays unused). `severity: 'error'`.
     */
    | 'plugin-error';
  severity: 'error' | 'warning';
  namespace: string;
  /**
   * Locale that owns this issue. For `unknown-key`/`dead-key` (which span all
   * locales) we report against the reference locale so the overlay can group
   * them coherently with the other issues.
   */
  locale: string;
  key?: string;
  /**
   * Locale label attached for display purposes (e.g. so the overlay can show a
   * primary-language value next to a missing translation). Validation itself
   * is symmetric across all locales — no locale is privileged as ground truth.
   */
  referenceLocale: string;
  /** For missing-variable: the variable names absent from the translation. */
  variables?: string[];
  /**
   * For `plugin-error`: the underlying failure message. Kept in its own field
   * (rather than overloading `key`) so the overlay can render it as a free-form
   * sentence instead of a `namespace:key` reference.
   */
  detail?: string;
}

export interface CoverageEntry {
  locale: string;
  namespace: string;
  totalKeys: number;
  translatedKeys: number;
  percentage: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  coverage: CoverageEntry[];
  timestamp: number;
  /**
   * Locale every other one is validated against. Mirrors the Vite plugin's
   * `referenceLocale` option so the browser overlay can render diffs without
   * baking `'en'` as a constant.
   */
  referenceLocale: string;
}

export interface FixEntry {
  type: 'set' | 'delete';
  locale: string;
  namespace: string;
  key: string;
  value?: string;
}
