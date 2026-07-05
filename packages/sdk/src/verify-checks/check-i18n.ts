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
 * The key model (manifest-implied keys, leaf walking) lives in
 * `@brika/schema/i18n-keys`, shared with the compiler's static usage analysis
 * (`brika verify` runs both). Bundles are read with hub semantics: every
 * `*.json` under `locales/<lang>/`, deep-merged.
 */

import { hasI18nKey, leafKeys, manifestI18nKeys } from '@brika/schema/i18n-keys';
import { loadAllLocaleBundles } from './locale-bundles';
import { registerCheck } from './registry';

/** Cap per-message key listings so one sweeping gap doesn't flood the output. */
const LIST_CAP = 8;

/** `a, b, c (+2 more)` with the tail capped. */
function capped(keys: readonly string[]): string {
  const shown = keys.slice(0, LIST_CAP).join(', ');
  const rest = keys.length - LIST_CAP;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

registerCheck(async ({ pkg, pluginDir }) => {
  const required = manifestI18nKeys(pkg);
  const bundles = await loadAllLocaleBundles(pluginDir);
  const locales = [...bundles.keys()];

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

  // "i18n is set up" means at least ONE locale, whichever language it is,
  // fully covers the manifest-implied keys. No hardcoded base language.
  const missingByLocale = new Map<string, string[]>();
  for (const [locale, bundle] of bundles) {
    missingByLocale.set(
      locale,
      required.filter((key) => !hasI18nKey(bundle, key))
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
