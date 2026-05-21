import { describe, expect, test } from 'bun:test';
import { parseNumberFormatterOption } from '../number-options';

describe('parseNumberFormatterOption — invalid input', () => {
  test('returns undefined for empty string', () => {
    expect(parseNumberFormatterOption('')).toBeUndefined();
  });

  test('returns undefined when key is missing', () => {
    expect(parseNumberFormatterOption(':2')).toBeUndefined();
  });

  test('returns undefined when value is missing', () => {
    expect(parseNumberFormatterOption('minimumFractionDigits:')).toBeUndefined();
  });

  test('returns undefined when there is no colon', () => {
    expect(parseNumberFormatterOption('minimumFractionDigits')).toBeUndefined();
  });

  test('returns undefined for unknown keys', () => {
    expect(parseNumberFormatterOption('banana:2')).toBeUndefined();
    expect(parseNumberFormatterOption('totallyMadeUp:foo')).toBeUndefined();
  });

  test('trims whitespace around key and value', () => {
    expect(parseNumberFormatterOption('  minimumFractionDigits  :  3  ')).toEqual({
      minimumFractionDigits: 3,
    });
  });
});

describe('parseNumberFormatterOption — numeric setters', () => {
  test('minimumFractionDigits accepts an integer', () => {
    expect(parseNumberFormatterOption('minimumFractionDigits:2')).toEqual({
      minimumFractionDigits: 2,
    });
  });

  test('maximumFractionDigits accepts an integer', () => {
    expect(parseNumberFormatterOption('maximumFractionDigits:4')).toEqual({
      maximumFractionDigits: 4,
    });
  });

  test('minimumIntegerDigits accepts an integer', () => {
    expect(parseNumberFormatterOption('minimumIntegerDigits:3')).toEqual({
      minimumIntegerDigits: 3,
    });
  });

  test('minimumSignificantDigits accepts an integer', () => {
    expect(parseNumberFormatterOption('minimumSignificantDigits:2')).toEqual({
      minimumSignificantDigits: 2,
    });
  });

  test('maximumSignificantDigits accepts an integer', () => {
    expect(parseNumberFormatterOption('maximumSignificantDigits:5')).toEqual({
      maximumSignificantDigits: 5,
    });
  });

  test('numeric setters drop non-numeric values', () => {
    expect(parseNumberFormatterOption('minimumFractionDigits:abc')).toEqual({});
    expect(parseNumberFormatterOption('maximumFractionDigits:NaN')).toEqual({});
    expect(parseNumberFormatterOption('minimumIntegerDigits:not-a-number')).toEqual({});
  });
});

describe('parseNumberFormatterOption — string setters', () => {
  test('currency passes value through unchanged', () => {
    expect(parseNumberFormatterOption('currency:EUR')).toEqual({ currency: 'EUR' });
    expect(parseNumberFormatterOption('currency:USD')).toEqual({ currency: 'USD' });
  });

  test('unit passes value through unchanged', () => {
    expect(parseNumberFormatterOption('unit:kilometer')).toEqual({ unit: 'kilometer' });
  });

  test('numberingSystem passes value through unchanged', () => {
    expect(parseNumberFormatterOption('numberingSystem:latn')).toEqual({ numberingSystem: 'latn' });
  });
});

describe('parseNumberFormatterOption — enum setters', () => {
  test('style accepts known values', () => {
    expect(parseNumberFormatterOption('style:decimal')).toEqual({ style: 'decimal' });
    expect(parseNumberFormatterOption('style:percent')).toEqual({ style: 'percent' });
    expect(parseNumberFormatterOption('style:currency')).toEqual({ style: 'currency' });
    expect(parseNumberFormatterOption('style:unit')).toEqual({ style: 'unit' });
  });

  test('style rejects unknown values', () => {
    expect(parseNumberFormatterOption('style:bogus')).toEqual({});
  });

  test('compactDisplay accepts short and long', () => {
    expect(parseNumberFormatterOption('compactDisplay:short')).toEqual({ compactDisplay: 'short' });
    expect(parseNumberFormatterOption('compactDisplay:long')).toEqual({ compactDisplay: 'long' });
  });

  test('compactDisplay rejects unknown values', () => {
    expect(parseNumberFormatterOption('compactDisplay:tiny')).toEqual({});
  });

  test('currencyDisplay accepts known values', () => {
    expect(parseNumberFormatterOption('currencyDisplay:code')).toEqual({ currencyDisplay: 'code' });
    expect(parseNumberFormatterOption('currencyDisplay:symbol')).toEqual({
      currencyDisplay: 'symbol',
    });
    expect(parseNumberFormatterOption('currencyDisplay:narrowSymbol')).toEqual({
      currencyDisplay: 'narrowSymbol',
    });
    expect(parseNumberFormatterOption('currencyDisplay:name')).toEqual({ currencyDisplay: 'name' });
  });

  test('currencyDisplay rejects unknown values', () => {
    expect(parseNumberFormatterOption('currencyDisplay:bogus')).toEqual({});
  });

  test('currencySign accepts standard and accounting', () => {
    expect(parseNumberFormatterOption('currencySign:standard')).toEqual({
      currencySign: 'standard',
    });
    expect(parseNumberFormatterOption('currencySign:accounting')).toEqual({
      currencySign: 'accounting',
    });
  });

  test('currencySign rejects unknown values', () => {
    expect(parseNumberFormatterOption('currencySign:weird')).toEqual({});
  });

  test('localeMatcher accepts lookup and best fit', () => {
    expect(parseNumberFormatterOption('localeMatcher:lookup')).toEqual({ localeMatcher: 'lookup' });
    expect(parseNumberFormatterOption('localeMatcher:best fit')).toEqual({
      localeMatcher: 'best fit',
    });
  });

  test('localeMatcher rejects unknown values', () => {
    expect(parseNumberFormatterOption('localeMatcher:strict')).toEqual({});
  });

  test('notation accepts known values', () => {
    expect(parseNumberFormatterOption('notation:standard')).toEqual({ notation: 'standard' });
    expect(parseNumberFormatterOption('notation:scientific')).toEqual({ notation: 'scientific' });
    expect(parseNumberFormatterOption('notation:engineering')).toEqual({
      notation: 'engineering',
    });
    expect(parseNumberFormatterOption('notation:compact')).toEqual({ notation: 'compact' });
  });

  test('notation rejects unknown values', () => {
    expect(parseNumberFormatterOption('notation:huge')).toEqual({});
  });

  test('signDisplay accepts known values', () => {
    expect(parseNumberFormatterOption('signDisplay:auto')).toEqual({ signDisplay: 'auto' });
    expect(parseNumberFormatterOption('signDisplay:never')).toEqual({ signDisplay: 'never' });
    expect(parseNumberFormatterOption('signDisplay:always')).toEqual({ signDisplay: 'always' });
    expect(parseNumberFormatterOption('signDisplay:exceptZero')).toEqual({
      signDisplay: 'exceptZero',
    });
    expect(parseNumberFormatterOption('signDisplay:negative')).toEqual({
      signDisplay: 'negative',
    });
  });

  test('signDisplay rejects unknown values', () => {
    expect(parseNumberFormatterOption('signDisplay:maybe')).toEqual({});
  });

  test('unitDisplay accepts known values', () => {
    expect(parseNumberFormatterOption('unitDisplay:long')).toEqual({ unitDisplay: 'long' });
    expect(parseNumberFormatterOption('unitDisplay:short')).toEqual({ unitDisplay: 'short' });
    expect(parseNumberFormatterOption('unitDisplay:narrow')).toEqual({ unitDisplay: 'narrow' });
  });

  test('unitDisplay rejects unknown values', () => {
    expect(parseNumberFormatterOption('unitDisplay:huge')).toEqual({});
  });
});

describe('parseNumberFormatterOption — useGrouping', () => {
  test('useGrouping:true maps to "always"', () => {
    expect(parseNumberFormatterOption('useGrouping:true')).toEqual({ useGrouping: 'always' });
  });

  test('useGrouping:always passes through as "always"', () => {
    expect(parseNumberFormatterOption('useGrouping:always')).toEqual({ useGrouping: 'always' });
  });

  test('useGrouping:false maps to false', () => {
    expect(parseNumberFormatterOption('useGrouping:false')).toEqual({ useGrouping: false });
  });

  test('useGrouping:never maps to false', () => {
    expect(parseNumberFormatterOption('useGrouping:never')).toEqual({ useGrouping: false });
  });

  test('useGrouping:none maps to false', () => {
    expect(parseNumberFormatterOption('useGrouping:none')).toEqual({ useGrouping: false });
  });

  test('useGrouping:auto and min2 pass through', () => {
    expect(parseNumberFormatterOption('useGrouping:auto')).toEqual({ useGrouping: 'auto' });
    expect(parseNumberFormatterOption('useGrouping:min2')).toEqual({ useGrouping: 'min2' });
  });

  test('useGrouping ignores unknown values', () => {
    expect(parseNumberFormatterOption('useGrouping:maybe')).toEqual({});
  });
});
