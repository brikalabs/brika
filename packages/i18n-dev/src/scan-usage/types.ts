/**
 * Browser-safe types and helpers for scan-usage. Importing from `./dispatch`
 * pulls in `node:fs/promises`, which Vite externalizes — anything consumed by
 * the dev overlay must live here instead.
 */

/** A single usage of a translation key in a source file. */
export interface KeyUsage {
  file: string;
  line: number;
}

/** Map of `namespace:key` → list of file locations where it appears. */
export type KeyUsageRecord = Record<string, KeyUsage[]>;

/**
 * Result of a static scan. Carries enough information for the validator to
 * be **100% accurate**: every locale key is either provably used, provably
 * dead, or in a namespace where dynamic calls make detection unreliable
 * (`opaqueNamespaces` / `hasGlobalOpaque`). The validator skips dead-key
 * reporting for uncertain cases rather than producing false positives.
 */
export interface KeyUsageMap {
  /** Statically-resolvable key references (`t('ns:key')`, `t(\`ns:key\`)`). */
  keys: KeyUsageRecord;
  /**
   * Static prefixes from template literals — `t(\`auth:rules.${x}\`)` yields
   * prefix `'auth:rules.'`. Any locale key starting with one of these is
   * considered used (the dynamic suffix could resolve to any of them).
   */
  patterns: string[];
  /**
   * Namespaces where the scanner observed an opaque dynamic call —
   * `t(someVar)` inside a file with `useTranslation('auth')` lands here as
   * `'auth'`. Locale keys under any of these are treated as potentially used.
   */
  opaqueNamespaces: string[];
  /**
   * Set when the scanner saw a fully unscoped opaque call — `t(varName)`
   * with no namespace context, or `t(\`${ns}:${key}\`)` with a dynamic
   * namespace. When true, the validator suppresses dead-key reporting
   * entirely because any key in any namespace could be the target.
   */
  hasGlobalOpaque: boolean;
}

export function emptyKeyUsageMap(): KeyUsageMap {
  return { keys: {}, patterns: [], opaqueNamespaces: [], hasGlobalOpaque: false };
}

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
