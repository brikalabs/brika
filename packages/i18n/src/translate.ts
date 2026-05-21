/**
 * Standalone `t()` resolution: given a translation tree for a locale, a key,
 * and options, return the rendered string. Pure function — no state.
 *
 * Used by `TranslationRegistry.t()` and any caller that already has resolved
 * namespace data (e.g. an SSR pipeline that pre-fetched a bundle).
 */

import { type FormatterMap, interpolate } from './interpolate';
import { getNestedValue } from './key-path';
import { type PluralCategory, pluralCategories, selectPluralSuffix } from './plural';
import type { TranslationData } from './types';

export interface TranslateOptions {
  /** Pluralization driver — picks `<key>_<category>` over the bare key. */
  readonly count?: number;
  /** Context suffix — `<key>_<context>` (and combines with `count` as `<key>_<context>_<category>`). */
  readonly context?: string;
  /** Fallback returned when the key (and all suffixed variants) is absent. */
  readonly defaultValue?: string;
  /** Locale used for plural rule selection and built-in formatters. */
  readonly locale?: string;
  /** Custom interpolation formatters in addition to the built-ins. */
  readonly formatters?: FormatterMap;
  /** Any other keys are passed to the interpolation step as parameters. */
  readonly [key: string]: unknown;
}

export type MissingKeyHandler = (key: string, locale: string) => string | undefined;

/**
 * Resolve a single translation key inside a known namespace tree.
 *
 * @param tree    The resolved-for-locale namespace data (already through the fallback chain).
 * @param key     Dot-separated path inside `tree` (e.g. `"actions.save"`).
 * @param options Interpolation params, plural count, context, default value.
 */
export function translate(
  tree: TranslationData,
  key: string,
  options: TranslateOptions = {}
): string | undefined {
  const locale = options.locale ?? 'en';
  const value = resolveKey(tree, key, options.count, options.context, locale);

  if (typeof value === 'string') {
    return interpolate(value, options, {
      locale,
      formatters: options.formatters,
    });
  }
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  return options.defaultValue;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function resolveKey(
  tree: TranslationData,
  key: string,
  count: number | undefined,
  context: string | undefined,
  locale: string
): unknown {
  // Try suffix variants in order: count+context, context, count, bare.
  if (count !== undefined && context) {
    const suffix = pluralSuffix(tree, key, count, context, locale);
    if (suffix !== null) {
      return suffix;
    }
  }
  if (context) {
    const ctxVal = getNestedValue(tree, `${key}_${context}`);
    if (ctxVal !== undefined) {
      return ctxVal;
    }
  }
  if (count !== undefined) {
    const suffix = pluralSuffix(tree, key, count, undefined, locale);
    if (suffix !== null) {
      return suffix;
    }
  }
  return getNestedValue(tree, key);
}

function pluralSuffix(
  tree: TranslationData,
  key: string,
  count: number,
  context: string | undefined,
  locale: string
): unknown {
  const baseKey = context ? `${key}_${context}` : key;
  // Which plural categories actually exist as suffixed keys?
  const available = new Set<PluralCategory>();
  for (const category of pluralCategories()) {
    if (getNestedValue(tree, `${baseKey}_${category}`) !== undefined) {
      available.add(category);
    }
  }
  if (available.size === 0) {
    return null;
  }

  const suffix = selectPluralSuffix(count, locale, available);
  if (!suffix) {
    return null;
  }
  return getNestedValue(tree, `${baseKey}${suffix}`);
}

/** Extract `<namespace>:<path>` from a key, given a default namespace. */
export interface ParsedKey {
  readonly namespace: string;
  readonly path: string;
}

export function parseKey(key: string, defaultNamespace: string, separator = ':'): ParsedKey {
  const idx = key.indexOf(separator);
  if (idx > 0) {
    return { namespace: key.slice(0, idx), path: key.slice(idx + 1) };
  }
  return { namespace: defaultNamespace, path: key };
}
