/** Options for the i18n dev Vite plugin. */
export interface I18nDevPluginOptions {
  /** Core locale directory (e.g. 'apps/hub/src/locales'). */
  localesDir: string;
  /** Reference locale used as ground truth (default: 'en'). */
  referenceLocale?: string;
  /**
   * Directories to scan for translation key usages (`t('key')` calls).
   * Defaults to `['./src']` relative to the Vite root.
   */
  srcDirs?: string[];
}

export interface ValidationIssue {
  type: 'missing-key' | 'extra-key' | 'missing-namespace' | 'missing-variable';
  severity: 'error' | 'warning';
  namespace: string;
  locale: string;
  key?: string;
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
}

export interface FixEntry {
  type: 'set' | 'delete';
  locale: string;
  namespace: string;
  key: string;
  value?: string;
}
