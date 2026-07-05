/**
 * Plugin-wide static i18n usage analysis, pure JS and edge-safe (no Bun, no
 * module execution) so it can run in `brika verify` AND in the registry's
 * publish gate over untarred sources.
 *
 *   - `scanI18nUsage` aggregates every `t()`/`tp()` key usage across the
 *     plugin's sources (same tokenizer as the injection transform);
 *   - `analyzeI18nUsage` cross-checks that usage against the locale bundles
 *     and the manifest-implied key set from `@brika/schema/i18n-keys`:
 *       error    an exact key used in code exists in NO locale;
 *       warning  a template pattern (`conditions.*`) matches NO locale key;
 *       warning  locale keys nothing references (not code, not manifest, not
 *                a runtime-resolved prefix) — stale after a rename, usually.
 */

import {
  impliedI18nKeys,
  leafKeys,
  manifestI18nKeys,
  RESERVED_I18N_KEYS,
  runtimeResolvedI18nPrefixes,
  type TranslationBundle,
} from '@brika/schema/i18n-keys';
import type { PluginPackageSchema } from '@brika/schema/plugin';
import { extractI18nKeys } from '../plugins/i18n-call-site/keys';

const TS_SOURCE = /\.tsx?$/;
// Test files never ship nor render; their t() calls are not runtime usage.
const TEST_SOURCE = /\.(test|spec)\.tsx?$/;
/** Cap per-message key listings so one sweeping gap doesn't flood the output. */
const LIST_CAP = 8;

/** Aggregated usage across a plugin's sources. Values are `file:line` sites. */
export interface PluginI18nUsage {
  readonly exact: ReadonlyMap<string, readonly string[]>;
  readonly patterns: ReadonlyMap<string, readonly string[]>;
  /** `file:line` of calls whose key is not a literal (statically unverifiable). */
  readonly dynamicSites: readonly string[];
}

/**
 * Extract every i18n key usage from the plugin sources (keys are the
 * sources-map keys, paths relative to the plugin root).
 */
export function scanI18nUsage(sources: ReadonlyMap<string, string>): PluginI18nUsage {
  const exact = new Map<string, string[]>();
  const patterns = new Map<string, string[]>();
  const dynamicSites: string[] = [];

  const push = (map: Map<string, string[]>, key: string, site: string) => {
    const sites = map.get(key);
    if (sites) {
      sites.push(site);
    } else {
      map.set(key, [site]);
    }
  };

  for (const [file, code] of sources) {
    if (!TS_SOURCE.test(file) || TEST_SOURCE.test(file)) {
      continue;
    }
    const usage = extractI18nKeys(code);
    for (const use of usage.exact) {
      push(exact, use.key, `${file}:${use.line}`);
    }
    for (const use of usage.patterns) {
      push(patterns, use.key, `${file}:${use.line}`);
    }
    for (let i = 0; i < usage.dynamic; i++) {
      dynamicSites.push(file);
    }
  }

  return { exact, patterns, dynamicSites };
}

/** `a, b, c (+2 more)` with the tail capped. */
function capped(keys: readonly string[]): string {
  const shown = keys.slice(0, LIST_CAP).join(', ');
  const rest = keys.length - LIST_CAP;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

/** A `*` pattern as an anchored regex; `*` spans one or more characters. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${escaped}$`);
}

export interface I18nUsageDiagnostics {
  errors: string[];
  warnings: string[];
}

/**
 * Cross-check static usage against the locale bundles + manifest. `bundles`
 * maps each language tag to its merged translation bundle; with no locales at
 * all this reports nothing (the setup error is the i18n verify-check's job).
 */
export function analyzeI18nUsage(
  usage: PluginI18nUsage,
  pkg: PluginPackageSchema,
  bundles: ReadonlyMap<string, TranslationBundle>
): I18nUsageDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (bundles.size === 0) {
    return { errors, warnings };
  }

  const union = new Set<string>();
  for (const bundle of bundles.values()) {
    for (const key of leafKeys(bundle)) {
      union.add(key);
    }
  }

  // Exact keys used in code but present in no locale: broken at runtime.
  for (const [key, sites] of [...usage.exact.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!union.has(key)) {
      errors.push(`i18n key "${key}" (used at ${sites[0]}) exists in no locale`);
    }
  }

  // Patterns that match nothing: either dead code or a missing key family.
  const regexes = new Map<string, RegExp>();
  for (const [pattern, sites] of [...usage.patterns.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const regex = patternToRegex(pattern);
    regexes.set(pattern, regex);
    if (![...union].some((key) => regex.test(key))) {
      warnings.push(`i18n key pattern "${pattern}" (used at ${sites[0]}) matches no locale key`);
    }
  }

  // Locale keys nothing references: not the manifest, not code, not a
  // runtime-resolved prefix. Usually stale after an id rename. A single
  // dynamic t(variable) call makes this unsound (any key may be referenced),
  // so the report is skipped entirely in that case.
  if (usage.dynamicSites.length > 0) {
    return { errors, warnings };
  }
  const referenced = new Set([
    ...manifestI18nKeys(pkg),
    ...impliedI18nKeys(pkg),
    ...RESERVED_I18N_KEYS,
  ]);
  const prefixes = runtimeResolvedI18nPrefixes(pkg);
  const unused = [...union]
    .filter((key) => {
      if (referenced.has(key) || usage.exact.has(key)) {
        return false;
      }
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        return false;
      }
      return ![...regexes.values()].some((regex) => regex.test(key));
    })
    .sort((a, b) => a.localeCompare(b));
  if (unused.length > 0) {
    warnings.push(
      `${unused.length} locale key(s) are referenced by neither the manifest nor any t() call: ${capped(unused)}`
    );
  }

  return { errors, warnings };
}
