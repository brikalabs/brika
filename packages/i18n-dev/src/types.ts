/**
 * Source tree that the dev plugin scans for translation-key usage.
 *
 * Each source declares a directory plus the namespace that bare `t('key')`
 * calls inside it implicitly belong to. The dev tool stays agnostic of how
 * the host's translation registry is structured — the host (consuming app)
 * supplies the per-tree namespace, including any prefix conventions like
 * `plugin:<pkg>` or `package:<id>`.
 *
 * Optional `localesDir` and `writeRoot` route per-source writes for plugins
 * or workspace packages whose JSON lives outside the main `localesDir`.
 */
export interface SourceConfig {
  /** Absolute path to the source directory to scan for `t()` calls. */
  readonly dir: string;
  /**
   * Namespace prefix for bare-key calls inside this source tree. Pass the
   * caller's prefix verbatim (e.g. `plugin:@scope/foo`) — the dev tool does
   * not interpret it.
   */
  readonly namespace?: string;
  /**
   * Locale directory that this source's translations live under. When set,
   * the directory is scanned by the validator and watched for changes.
   */
  readonly localesDir?: string;
  /**
   * Optional override for write routing. When the overlay edits a key whose
   * qualified namespace matches `namespace`, the write lands at
   * `${writeRoot}/${locale}/${file}.json`. Defaults to `localesDir`.
   */
  readonly writeRoot?: string;
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
}

export interface ValidationIssue {
  type: 'missing-key' | 'missing-namespace' | 'missing-variable';
  severity: 'error' | 'warning';
  namespace: string;
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
