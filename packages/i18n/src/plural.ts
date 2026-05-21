/**
 * CLDR plural category resolution using `Intl.PluralRules`. A translation key
 * `messages.count` becomes `messages.count_one` / `messages.count_other` etc.
 * depending on the locale's plural rules.
 */

// `Intl.PluralRules.select()` already returns this exact union; alias so the
// rest of the codebase keeps a stable name without redeclaring the union.
export type PluralCategory = Intl.LDMLPluralRule;

const ALL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Memoize PluralRules instances per locale (PluralRules construction isn't free). */
const ruleCache = new Map<string, Intl.PluralRules>();

function getRules(locale: string): Intl.PluralRules {
  let rules = ruleCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules('en');
    }
    ruleCache.set(locale, rules);
  }
  return rules;
}

export function selectPlural(count: number, locale: string): PluralCategory {
  return getRules(locale).select(count);
}

/**
 * Pick the best plural suffix for `count` from the categories present in `available`.
 * Falls back through `other` and finally an unsuffixed key.
 *
 * Returns the suffix (e.g. `'_one'`) — empty string means "use the bare key".
 */
export function selectPluralSuffix(
  count: number,
  locale: string,
  available: ReadonlySet<PluralCategory>
): string {
  const exact = selectPlural(count, locale);
  if (available.has(exact)) {
    return `_${exact}`;
  }
  if (available.has('other')) {
    return '_other';
  }
  return '';
}

/** All CLDR plural categories, in fallback order. */
export function pluralCategories(): readonly PluralCategory[] {
  return ALL_CATEGORIES;
}
