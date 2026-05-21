/**
 * `{{n, number, key:val}}` option parser for the interpolation pipeline.
 *
 * The previous version cast an arbitrary `{ [userKey]: value }` to
 * `Intl.NumberFormatOptions`, which lied about the type — `{ banana: 2 }`
 * would pass through unchecked. Each numeric / string option is now applied
 * through an explicit setter, so only real keys land in the result. Unknown
 * keys are silently dropped.
 */

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

export function parseNumberFormatterOption(option: string): Intl.NumberFormatOptions | undefined {
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
