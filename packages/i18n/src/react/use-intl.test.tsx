/**
 * Unit tests for `useIntl`. The hook constructs eight `Intl.*Format` instances
 * up-front and exposes formatter functions that may or may not delegate to
 * those cached instances depending on whether the caller passes options. Each
 * test renders a probe component and asserts on the returned API.
 *
 * SSR (`renderToString`) gives us the snapshot path of `useSyncExternalStore`,
 * so `useTimeFormatStore` resolves to the `auto` default and `hour12` is
 * `undefined`. That keeps the suite portable without faking `localStorage`.
 */

import { describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { type UseIntlResult, useIntl } from './use-intl';

interface ProbeProps {
  readonly onResult: (r: UseIntlResult) => void;
}

function Probe({ onResult }: Readonly<ProbeProps>): ReactElement {
  const result = useIntl();
  onResult(result);
  return <span>.</span>;
}

async function buildInstance(language: string): Promise<typeof i18next> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: false,
    defaultNS: 'common',
    ns: ['common'],
    resources: { [language]: { common: {} } },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  });
  return instance;
}

function renderProbe(instance: typeof i18next): UseIntlResult {
  let captured: UseIntlResult | null = null;
  renderToString(
    <I18nextProvider i18n={instance}>
      <Suspense fallback={<span>loading</span>}>
        <Probe
          onResult={(r) => {
            captured = r;
          }}
        />
      </Suspense>
    </I18nextProvider>
  );
  if (!captured) {
    throw new Error('useIntl did not yield a result');
  }
  return captured;
}

describe('useIntl — locale plumbing', () => {
  test('exposes the active language as `locale`', async () => {
    const inst = await buildInstance('fr');
    const result = renderProbe(inst);
    expect(result.locale).toBe('fr');
  });

  test('defaults timeFormat to "auto" (SSR snapshot path)', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.timeFormat).toBe('auto');
    expect(typeof result.setTimeFormat).toBe('function');
  });

  test('falls back to "en" formatters when locale is cimode', async () => {
    const inst = await buildInstance('cimode');
    const result = renderProbe(inst);
    // 1234 in cimode should still render via the "en" number formatter.
    expect(result.formatNumber(1234)).toBe('1,234');
  });
});

describe('useIntl — formatDate / formatTime / formatDateTime', () => {
  const sample = new Date('2024-03-15T10:30:00Z');

  test('formatDate without options uses the cached medium-date formatter', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDate(sample);
    expect(out).toMatch(/Mar/);
    expect(out).toMatch(/2024/);
  });

  test('formatDate with no date component falls back to dateStyle: medium', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    // Passing only timeZone (no date component) triggers the default-merge branch.
    const out = result.formatDate(sample, { timeZone: 'UTC' });
    expect(out).toMatch(/Mar/);
  });

  test('formatDate with explicit date component (year) skips the default-merge', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDate(sample, { year: 'numeric', timeZone: 'UTC' });
    expect(out).toBe('2024');
  });

  test('formatTime without options uses the cached short-time formatter', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(typeof result.formatTime(sample)).toBe('string');
  });

  test('formatTime with hour component skips the default-merge branch', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatTime(sample, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    expect(out).toMatch(/10/);
    expect(out).toMatch(/30/);
  });

  test('formatTime with no time component falls back to timeStyle: short', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatTime(sample, { timeZone: 'UTC' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formatDateTime without options merges both default styles', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDateTime(sample);
    expect(out).toMatch(/2024/);
  });

  test('formatDateTime with both date and time components preserves caller options verbatim', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDateTime(sample, {
      year: 'numeric',
      hour: '2-digit',
      timeZone: 'UTC',
    });
    expect(out).toMatch(/2024/);
  });

  test('formatDateTime with only date components does not inject timeStyle', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(() => result.formatDateTime(sample, { year: 'numeric' })).not.toThrow();
  });

  test('formatDateTime with only time components does not inject dateStyle', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(() => result.formatDateTime(sample, { hour: '2-digit' })).not.toThrow();
  });
});

describe('useIntl — formatRelativeTime / formatNumber / formatCurrency', () => {
  test('formatRelativeTime renders signed values with their unit', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.formatRelativeTime(-1, 'day')).toMatch(/yesterday/i);
    expect(result.formatRelativeTime(2, 'day')).toMatch(/in 2 days/i);
  });

  test('formatNumber without options uses the cached number formatter', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.formatNumber(1234.5)).toBe('1,234.5');
  });

  test('formatNumber with options creates a fresh NumberFormat', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.formatNumber(0.5, { style: 'percent' })).toBe('50%');
  });

  test('formatCurrency renders in the active locale', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatCurrency(42, 'USD');
    expect(out).toMatch(/42/);
    expect(out).toMatch(/\$/);
  });
});

describe('useIntl — formatDuration / formatList', () => {
  test('formatDuration without options uses the cached long-style formatter', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDuration({ hours: 1, minutes: 30 });
    expect(out).toContain('1');
    expect(out).toContain('30');
  });

  test('formatDuration with style option creates a fresh DurationFormat', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    const out = result.formatDuration({ hours: 2 }, { style: 'short' });
    expect(out).toContain('2');
  });

  test('formatList without options uses the cached long-conjunction formatter', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.formatList(['a', 'b', 'c'])).toBe('a, b, and c');
  });

  test('formatList with options creates a fresh ListFormat', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.formatList(['a', 'b'], { type: 'disjunction' })).toMatch(/or/);
  });
});

describe('useIntl — getLanguageName / getRegionName', () => {
  test('getLanguageName returns the localized label for a known code', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.getLanguageName('fr')).toBe('French');
    expect(result.getLanguageName('en')).toBe('English');
  });

  test('getLanguageName returns the special "CI Mode (Keys)" label for cimode', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.getLanguageName('cimode')).toBe('CI Mode (Keys)');
  });

  test('getLanguageName falls back to the code when DisplayNames throws', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.getLanguageName('not-a-real-tag!')).toBe('not-a-real-tag!');
  });

  test('getRegionName returns the localized label for a known region code', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.getRegionName('US')).toBe('United States');
  });

  test('getRegionName falls back to the code when DisplayNames throws', async () => {
    const inst = await buildInstance('en');
    const result = renderProbe(inst);
    expect(result.getRegionName('not-a-real-region!')).toBe('not-a-real-region!');
  });
});
