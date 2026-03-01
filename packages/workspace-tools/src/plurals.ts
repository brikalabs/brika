type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type PluralExactKey = `=${number}`;

export interface PluralOptions {
  locale?: string;
  numberFormat?: Intl.NumberFormat;
}

export type PluralForms = Partial<Record<PluralCategory, string>> &
  Partial<Record<PluralExactKey, string>> & {
    other: string;
  };

const pluralRulesCache = new Map<string, Intl.PluralRules>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

/**
 * Returns a locale-aware pluralized phrase using Angular-style plural forms.
 *
 * Exact matches (`=0`, `=1`, ...) take precedence over category matches.
 * `#` is replaced with the locale-formatted count.
 */
export function plurals(forms: PluralForms, count: number, options: PluralOptions = {}): string {
  const exactMatch = forms[`=${count}`];
  const category = getPluralRules(options.locale).select(count);
  const template = exactMatch ?? forms[category] ?? forms.other;
  const number = (options.numberFormat ?? getNumberFormat(options.locale)).format(count);
  return template.includes('#') ? template.split('#').join(number) : template;
}

function getPluralRules(locale?: string): Intl.PluralRules {
  const key = locale ?? '';
  const cached = pluralRulesCache.get(key);
  if (cached) {
    return cached;
  }
  const created = new Intl.PluralRules(locale);
  pluralRulesCache.set(key, created);
  return created;
}

function getNumberFormat(locale?: string): Intl.NumberFormat {
  const key = locale ?? '';
  const cached = numberFormatCache.get(key);
  if (cached) {
    return cached;
  }
  const created = new Intl.NumberFormat(locale);
  numberFormatCache.set(key, created);
  return created;
}
