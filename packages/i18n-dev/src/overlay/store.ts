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

export const REFERENCE_LOCALE = 'en';

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

export { buildFix, fixAllIssues, fixIssue, sendFixes } from './autofix';

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
