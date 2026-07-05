/**
 * i18n coverage check.
 *
 * Every sentence-bearing piece of plugin metadata is displayed through the
 * hub's i18n layer, keyed by entity id (`blocks.<id>.name`,
 * `preferences.<name>.title`, ...) with the manifest string as a last-resort
 * fallback (see the `tp()` call sites in apps/ui). This check enforces that
 * contract at author time:
 *
 *   - a plugin with localizable surface must ship `locales/<lang>/` for at
 *     least one language (error);
 *   - at least ONE locale (any language, no hardcoded base) must cover every
 *     key the manifest implies (error otherwise, reporting the closest
 *     locale's gaps);
 *   - every locale is diffed against the UNION of all locales' keys (metadata
 *     keys and in-code `t()` strings alike), so a partial translation
 *     surfaces before publish instead of silently falling back (warnings).
 *
 * Bundles are read the way the hub reads them: every `*.json` under
 * `locales/<lang>/` deep-merged into one namespace.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginPackageSchema, PreferenceSchema } from '@brika/schema/plugin';
import { registerCheck } from './registry';

type Bundle = Record<string, unknown>;

/** Cap per-message key listings so one sweeping gap doesn't flood the output. */
const LIST_CAP = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The `<lang>` directories under `locales/`, sorted. Empty when none exist. */
async function localeDirs(pluginDir: string): Promise<string[]> {
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

function deepMerge(target: Bundle, source: Bundle): void {
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
async function loadBundle(pluginDir: string, locale: string): Promise<Bundle> {
  const dir = join(pluginDir, 'locales', locale);
  const bundle: Bundle = {};
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

/** Every dot-path whose value is a leaf (anything but a plain object). */
function leafKeys(bundle: Bundle, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) {
      keys.push(...leafKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/** True when `path` resolves to a non-empty string in the bundle. */
function hasKey(bundle: Bundle, path: string): boolean {
  let node: unknown = bundle;
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) {
      return false;
    }
    node = node[part];
  }
  return typeof node === 'string' && node.trim().length > 0;
}

/** `a, b, c (+2 more)` with the tail capped. */
function capped(keys: readonly string[]): string {
  const shown = keys.slice(0, LIST_CAP).join(', ');
  const rest = keys.length - LIST_CAP;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

interface NamedEntry {
  id: string;
  description?: string;
}

/** `<kind>.<id>.name` for every entry; `.description` when the manifest has one. */
function entityKeys(kind: string, entries: readonly NamedEntry[] | undefined): string[] {
  const keys: string[] = [];
  for (const entry of entries ?? []) {
    keys.push(`${kind}.${entry.id}.name`);
    if (entry.description !== undefined) {
      keys.push(`${kind}.${entry.id}.description`);
    }
  }
  return keys;
}

/**
 * A preference-shaped field (plugin preference or brick config entry) at
 * `base`: `<base>.<title field>` always, `.description` when the manifest has
 * one, `.options.<value>` per dropdown option (see the schema's DropdownOption
 * doc: option labels come from i18n).
 */
function preferenceKeys(base: string, titleField: string, field: PreferenceSchema): string[] {
  const keys: string[] = [`${base}.${titleField}`];
  if (field.description !== undefined) {
    keys.push(`${base}.description`);
  }
  if (field.type === 'dropdown') {
    keys.push(...field.options.map((opt) => `${base}.options.${opt.value}`));
  }
  return keys;
}

/**
 * Every i18n key the manifest implies. Mirrors the UI's lookup contract:
 * entity names/descriptions, preference titles (+ dropdown option labels) and
 * brick config field labels.
 */
function requiredKeys(pkg: PluginPackageSchema): string[] {
  const keys: string[] = [];
  if (pkg.displayName !== undefined) {
    keys.push('name');
  }
  if (pkg.description !== undefined) {
    keys.push('description');
  }
  keys.push(
    ...entityKeys('blocks', pkg.blocks),
    ...entityKeys('sparks', pkg.sparks),
    ...entityKeys('tools', pkg.tools),
    ...entityKeys('pages', pkg.pages),
    ...entityKeys('bricks', pkg.bricks)
  );
  for (const pref of pkg.preferences ?? []) {
    keys.push(...preferenceKeys(`preferences.${pref.name}`, 'title', pref));
  }
  for (const brick of pkg.bricks ?? []) {
    for (const field of brick.config ?? []) {
      keys.push(...preferenceKeys(`bricks.${brick.id}.config.${field.name}`, 'label', field));
    }
  }
  return keys;
}

registerCheck(async ({ pkg, pluginDir }) => {
  const required = requiredKeys(pkg);
  const locales = await localeDirs(pluginDir);

  if (locales.length === 0) {
    if (required.length === 0) {
      return {};
    }
    return {
      errors: [
        `plugin metadata must be localized: add locales/<lang>/plugin.json for at least one language (${required.length} key(s) expected, e.g. ${capped(required.slice(0, 3))})`,
      ],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const bundles = new Map<string, Bundle>();
  for (const locale of locales) {
    bundles.set(locale, await loadBundle(pluginDir, locale));
  }

  // "i18n is set up" means at least ONE locale, whichever language it is,
  // fully covers the manifest-implied keys. No hardcoded base language.
  const missingByLocale = new Map<string, string[]>();
  for (const [locale, bundle] of bundles) {
    missingByLocale.set(
      locale,
      required.filter((key) => !hasKey(bundle, key))
    );
  }
  const fullyCovered = locales.filter((locale) => missingByLocale.get(locale)?.length === 0);
  if (required.length > 0 && fullyCovered.length === 0) {
    const [closest, missing] = [...missingByLocale.entries()].sort(
      (a, b) => a[1].length - b[1].length
    )[0] ?? ['?', required];
    const sortedMissing = [...missing].sort((a, b) => a.localeCompare(b));
    errors.push(
      `no locale fully covers the plugin metadata; closest is locales/${closest}, missing ${sortedMissing.length} key(s): ${capped(sortedMissing)}`
    );
  }

  // Diff every locale against the union of all locales' keys, so incomplete
  // translations (metadata or in-code t() strings) are visible everywhere.
  const union = new Set<string>();
  for (const bundle of bundles.values()) {
    for (const key of leafKeys(bundle)) {
      union.add(key);
    }
  }
  for (const locale of locales) {
    const localeLeafs = new Set(leafKeys(bundles.get(locale) ?? {}));
    const missing = [...union]
      .filter((key) => !localeLeafs.has(key))
      .sort((a, b) => a.localeCompare(b));
    if (missing.length > 0) {
      warnings.push(
        `locales/${locale} is missing ${missing.length} translation(s) other locales have: ${capped(missing)}`
      );
    }
  }

  return { errors, warnings };
});
