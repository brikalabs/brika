/**
 * Re-export façade for overlay state. Splits across:
 *   - `i18next-store.ts` — read/write helpers over `i18next.store`
 *   - `usage-tracker.ts` — static + runtime call-site capture
 *   - `autofix.ts`       — fix builders + HTTP roundtrip
 *   - `call-site.ts`     — build-time `__cs` parsing
 *
 * Modules import directly from those files; the façade exists so external
 * test/usage paths keep working with `./store`.
 */

import { getStoreData, walkStoreEntries } from './i18next-store';

/**
 * Reference locale (the locale every other one is validated against). Defaults
 * to `'en'` because most projects use it, but the host can override via the
 * Vite plugin's `referenceLocale` option — the validation HMR payload carries
 * the configured value, and the overlay sets it via `setReferenceLocale` on
 * the first event. Exposed as a getter so consumers always see the live value.
 */
let currentReferenceLocale = 'en';

export function getReferenceLocale(): string {
  return currentReferenceLocale;
}

export function setReferenceLocale(locale: string): void {
  if (locale) {
    currentReferenceLocale = locale;
  }
}

export { buildFix, fixAllIssues, fixIssue, sendFixes } from './autofix';
export {
  applyTranslationBundle,
  getLocales,
  getNestedStoreValue,
  getStoreData,
  removeFromI18nextStore,
  subscribeStore,
  updateI18nextStore,
  walkStoreEntries,
} from './i18next-store';
export {
  applyKeyUsage,
  getKeyUsage,
  getMergedKeyUsage,
  getRuntimeUsages,
  installTranslationTracker,
  subscribeKeyUsage,
  subscribeRuntimeUsages,
  trackedTranslations,
} from './usage-tracker';

interface TranslationEntry {
  ns: string;
  key: string;
  value: string;
}

export function getTranslations(locale?: string): TranslationEntry[] {
  const resources = getStoreData(locale);
  if (!resources) {
    return [];
  }
  const out: TranslationEntry[] = [];
  walkStoreEntries(resources, (ns, key, value) => out.push({ ns, key, value }));
  return out.sort((a, b) => `${a.ns}:${a.key}`.localeCompare(`${b.ns}:${b.key}`));
}
