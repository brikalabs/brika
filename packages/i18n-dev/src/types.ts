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
   * Local locale directory to scan (e.g. `'apps/hub/src/locales'`).
   *
   * Relative paths resolve against the Vite project root (so `'../hub/src/locales'`
   * works from `apps/ui/vite.config.ts`). Absolute paths are used as-is.
   *
   * Optional when `apiUrl` / `hub` is supplied — without either, the plugin
   * has nothing to do. When both are set, local files are the source of truth
   * (HMR, edits, key usage) and the remote data is fetched alongside for diff
   * visibility.
   */
  readonly localesDir?: string;
  /**
   * Hub origin (e.g. `'http://127.0.0.1:3001'`). When set, the plugin derives
   * `apiUrl` as `'${hub}/api/i18n'` automatically — saves you from
   * concatenating the API suffix at the call site.
   *
   * Ignored when `apiUrl` is also set (explicit override wins).
   */
  readonly hub?: string;
  /**
   * Explicit i18n API base URL (e.g. `'http://localhost:3001/api/i18n'`).
   * Overrides anything derived from `hub`. Use this when the hub serves its
   * i18n API under a non-default path, or when pointing at a staging URL.
   */
  readonly apiUrl?: string;
  /** Reference locale used as ground truth (default: 'en'). */
  readonly referenceLocale?: string;
  /**
   * i18next default namespace — used by the generated `i18n-namespaces.ts`
   * to place this name first regardless of where it sorts. Defaults to
   * `'translation'` to match i18next's own default.
   */
  readonly defaultNamespace?: string;
  /**
   * Source trees scanned for translation-key usages (`t('key')` calls).
   * Defaults to `[{ dir: './src' }]` relative to the Vite root.
   *
   * The host (consuming app) is responsible for declaring its trees here.
   * Anything that needs to be tagged with a particular namespace prefix
   * (workspace plugins, SDK shim wrappers, etc.) is the host's concern.
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
