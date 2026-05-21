import { getReferenceLocale, getTranslations } from './store';

export interface MultiLocaleKey {
  ns: string;
  key: string;
  values: Record<string, string | undefined>;
  missingCount: number;
}

/**
 * Walk every locale's translations and build one row per (namespace, key) that
 * appears in *any* locale. The total set of keys is the union — no locale is
 * privileged — so a key present in French but missing in English shows up as
 * a row where the `en` slot is empty (missingCount: 1).
 */
export function buildMultiLocaleKeys(locales: string[]): MultiLocaleKey[] {
  const referenceLocale = getReferenceLocale();
  const orderedLocales = orderLocales(locales, referenceLocale);

  const rows = new Map<string, MultiLocaleKey>();
  for (const locale of orderedLocales) {
    for (const entry of getTranslations(locale)) {
      const eid = `${entry.ns}:${entry.key}`;
      let row = rows.get(eid);
      if (!row) {
        row = { ns: entry.ns, key: entry.key, values: {}, missingCount: 0 };
        rows.set(eid, row);
      }
      row.values[locale] = entry.value;
    }
  }

  for (const row of rows.values()) {
    let missing = 0;
    for (const locale of orderedLocales) {
      if (row.values[locale] === undefined) {
        missing++;
      }
    }
    row.missingCount = missing;
  }

  return [...rows.values()].sort((a, b) => `${a.ns}:${a.key}`.localeCompare(`${b.ns}:${b.key}`));
}

function orderLocales(locales: string[], referenceLocale: string): string[] {
  if (!locales.includes(referenceLocale)) {
    return locales;
  }
  return [referenceLocale, ...locales.filter((l) => l !== referenceLocale)];
}
