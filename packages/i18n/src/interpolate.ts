/**
 * String interpolation with optional named formatters.
 *
 *   "Hello {{name}}"                 → simple substitution
 *   "{{count, number}}"              → applies the `number` formatter
 *   "{{price, currency, USD}}"       → formatter with an option argument
 *   "Saved at {{ts, datetime, short}}" → formatter with option, locale-aware
 *
 * Missing values render as the empty string. Unknown formatters fall back to
 * `String(value)`. Escape literal double-braces by writing `{{` twice — there
 * is no escape mechanism by design; nested braces are not supported.
 */

export type Formatter = (value: unknown, locale: string, option?: string) => string;
export type FormatterMap = Record<string, Formatter>;

export interface InterpolateOptions {
  /** Locale used by built-in formatters (defaults to `'en'`). */
  readonly locale?: string;
  /** Extra formatters that override or extend the built-ins. */
  readonly formatters?: FormatterMap;
}

const INTERPOLATION_RE = /\{\{([^{}]+)\}\}/g;

export const defaultFormatters: FormatterMap = {
  number(value, locale, option) {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return String(value);
    }
    const opts = option ? parseFormatterOption(option) : undefined;
    return new Intl.NumberFormat(locale, opts).format(num);
  },
  currency(value, locale, option) {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return String(value);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: option ?? 'USD',
    }).format(num);
  },
  percent(value, locale) {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return String(value);
    }
    return new Intl.NumberFormat(locale, { style: 'percent' }).format(num);
  },
  date(value, locale, option) {
    const date = toDate(value);
    if (!date) {
      return String(value);
    }
    const style = isDateStyle(option) ? option : 'medium';
    return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(date);
  },
  time(value, locale, option) {
    const date = toDate(value);
    if (!date) {
      return String(value);
    }
    const style = isDateStyle(option) ? option : 'short';
    return new Intl.DateTimeFormat(locale, { timeStyle: style }).format(date);
  },
  datetime(value, locale, option) {
    const date = toDate(value);
    if (!date) {
      return String(value);
    }
    const style = isDateStyle(option) ? option : 'medium';
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: 'short' }).format(date);
  },
  relative(value, locale, option) {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return String(value);
    }
    const unit = isRelativeUnit(option) ? option : 'second';
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(num, unit);
  },
  list(value, locale) {
    if (!Array.isArray(value)) {
      return String(value);
    }
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
      value.map((v) => String(v))
    );
  },
  uppercase(value, locale) {
    return String(value).toLocaleUpperCase(locale);
  },
  lowercase(value, locale) {
    return String(value).toLocaleLowerCase(locale);
  },
};

export function interpolate(
  template: string,
  params: Record<string, unknown>,
  options: InterpolateOptions = {}
): string {
  if (!template.includes('{{')) {
    return template;
  }
  const locale = options.locale ?? 'en';
  const formatters: FormatterMap = options.formatters
    ? { ...defaultFormatters, ...options.formatters }
    : defaultFormatters;

  return template.replace(INTERPOLATION_RE, (_match, expr: string) => {
    const parts = expr.split(',').map((s) => s.trim());
    const name = parts[0] ?? '';
    if (!name) {
      return '';
    }

    const value = params[name];
    if (value === undefined || value === null) {
      return '';
    }

    const formatterName = parts[1];
    if (!formatterName) {
      return String(value);
    }
    const formatter = formatters[formatterName];
    if (!formatter) {
      return String(value);
    }
    const option = parts[2];
    return formatter(value, locale, option);
  });
}

// ─── Internals ──────────────────────────────────────────────────────────────

// `{{n, number, key:val}}` parser. The previous version cast an arbitrary
// `{ [userKey]: value }` to `Intl.NumberFormatOptions`, which lied about the
// type — `{ banana: 2 }` would pass through unchecked. Each numeric / string
// option is now applied through an explicit setter, so only real keys land in
// the result. Unknown keys are silently dropped.

type NumberOptionSetter = (opts: Intl.NumberFormatOptions, value: string) => void;

function asNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

const NUMBER_OPTION_SETTERS: Readonly<Record<string, NumberOptionSetter>> = {
  compactDisplay(opts, value) {
    if (value === 'short' || value === 'long') {
      opts.compactDisplay = value;
    }
  },
  currency(opts, value) {
    opts.currency = value;
  },
  currencyDisplay(opts, value) {
    if (value === 'code' || value === 'symbol' || value === 'narrowSymbol' || value === 'name') {
      opts.currencyDisplay = value;
    }
  },
  currencySign(opts, value) {
    if (value === 'standard' || value === 'accounting') {
      opts.currencySign = value;
    }
  },
  localeMatcher(opts, value) {
    if (value === 'lookup' || value === 'best fit') {
      opts.localeMatcher = value;
    }
  },
  maximumFractionDigits(opts, value) {
    const n = asNumber(value);
    if (n !== undefined) {
      opts.maximumFractionDigits = n;
    }
  },
  maximumSignificantDigits(opts, value) {
    const n = asNumber(value);
    if (n !== undefined) {
      opts.maximumSignificantDigits = n;
    }
  },
  minimumFractionDigits(opts, value) {
    const n = asNumber(value);
    if (n !== undefined) {
      opts.minimumFractionDigits = n;
    }
  },
  minimumIntegerDigits(opts, value) {
    const n = asNumber(value);
    if (n !== undefined) {
      opts.minimumIntegerDigits = n;
    }
  },
  minimumSignificantDigits(opts, value) {
    const n = asNumber(value);
    if (n !== undefined) {
      opts.minimumSignificantDigits = n;
    }
  },
  notation(opts, value) {
    if (
      value === 'standard' ||
      value === 'scientific' ||
      value === 'engineering' ||
      value === 'compact'
    ) {
      opts.notation = value;
    }
  },
  numberingSystem(opts, value) {
    opts.numberingSystem = value;
  },
  signDisplay(opts, value) {
    if (
      value === 'auto' ||
      value === 'never' ||
      value === 'always' ||
      value === 'exceptZero' ||
      value === 'negative'
    ) {
      opts.signDisplay = value;
    }
  },
  style(opts, value) {
    if (value === 'decimal' || value === 'percent' || value === 'currency' || value === 'unit') {
      opts.style = value;
    }
  },
  unit(opts, value) {
    opts.unit = value;
  },
  unitDisplay(opts, value) {
    if (value === 'long' || value === 'short' || value === 'narrow') {
      opts.unitDisplay = value;
    }
  },
  useGrouping(opts, value) {
    if (value === 'true' || value === 'always') {
      opts.useGrouping = 'always';
    } else if (value === 'false' || value === 'never' || value === 'none') {
      opts.useGrouping = false;
    } else if (value === 'auto' || value === 'min2') {
      opts.useGrouping = value;
    }
  },
};

function parseFormatterOption(option: string): Intl.NumberFormatOptions | undefined {
  // e.g. "minimumFractionDigits:2" → { minimumFractionDigits: 2 }
  const [rawKey, rawValue] = option.split(':').map((s) => s.trim());
  if (!rawKey || !rawValue) {
    return undefined;
  }
  const setter = NUMBER_OPTION_SETTERS[rawKey];
  if (!setter) {
    return undefined;
  }
  const opts: Intl.NumberFormatOptions = {};
  setter(opts, rawValue);
  return opts;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const DATE_STYLES = ['full', 'long', 'medium', 'short'] as const;
type DateStyle = (typeof DATE_STYLES)[number];
const DATE_STYLE_SET: ReadonlySet<string> = new Set<string>(DATE_STYLES);

function isDateStyle(value: string | undefined): value is DateStyle {
  return value !== undefined && DATE_STYLE_SET.has(value);
}

const RELATIVE_UNITS = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
] as const satisfies readonly Intl.RelativeTimeFormatUnit[];
const RELATIVE_UNIT_SET: ReadonlySet<string> = new Set<string>(RELATIVE_UNITS);

function isRelativeUnit(value: string | undefined): value is Intl.RelativeTimeFormatUnit {
  return value !== undefined && RELATIVE_UNIT_SET.has(value);
}
