/**
 * Locale bundle loading, shared by the i18n verify-check and the CLI's
 * compiler-backed usage analysis. Reads bundles the way the hub reads them:
 * every `*.json` under `locales/<lang>/`, deep-merged into one namespace.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TranslationBundle } from '@brika/schema/i18n-keys';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The `<lang>` directories under `locales/`, sorted. Empty when none exist. */
export async function localeDirs(pluginDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(pluginDir, 'locales'), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function deepMerge(target: TranslationBundle, source: TranslationBundle): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      deepMerge(existing, value);
    } else {
      target[key] = value;
    }
  }
}

/** One locale's bundle: every `*.json` in its folder deep-merged (hub semantics). */
export async function loadLocaleBundle(
  pluginDir: string,
  locale: string
): Promise<TranslationBundle> {
  const dir = join(pluginDir, 'locales', locale);
  const bundle: TranslationBundle = {};
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return bundle;
  }
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'));
      if (isPlainObject(parsed)) {
        deepMerge(bundle, parsed);
      }
    } catch {
      // Malformed JSON is the hub loader's problem to warn about; here it
      // simply contributes no keys, which the coverage diff will surface.
    }
  }
  return bundle;
}

/** Every locale's bundle, keyed by language tag. */
export async function loadAllLocaleBundles(
  pluginDir: string
): Promise<Map<string, TranslationBundle>> {
  const bundles = new Map<string, TranslationBundle>();
  for (const locale of await localeDirs(pluginDir)) {
    bundles.set(locale, await loadLocaleBundle(pluginDir, locale));
  }
  return bundles;
}
