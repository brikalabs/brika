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

import { parseNumberFormatterOption } from './number-options';

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
    const opts = option ? parseNumberFormatterOption(option) : undefined;
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
