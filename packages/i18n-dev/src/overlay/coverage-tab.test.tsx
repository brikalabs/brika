import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { CoverageEntry } from '../types';
import { CoverageContent } from './coverage-tab';

const sampleCoverage: CoverageEntry[] = [
  { locale: 'en', namespace: 'common', totalKeys: 10, translatedKeys: 10, percentage: 100 },
  { locale: 'en', namespace: 'auth', totalKeys: 5, translatedKeys: 5, percentage: 100 },
  { locale: 'fr', namespace: 'common', totalKeys: 10, translatedKeys: 8, percentage: 80 },
  { locale: 'fr', namespace: 'auth', totalKeys: 5, translatedKeys: 3, percentage: 60 },
  { locale: 'de', namespace: 'common', totalKeys: 10, translatedKeys: 10, percentage: 100 },
  { locale: 'de', namespace: 'auth', totalKeys: 5, translatedKeys: 5, percentage: 100 },
];

describe('CoverageContent', () => {
  test('renders empty state when no data', () => {
    const html = renderToString(<CoverageContent coverage={[]} />);
    expect(html).toContain('No coverage data');
  });

  test('renders coverage stats', () => {
    const html = renderToString(<CoverageContent coverage={sampleCoverage} />);
    expect(html).toContain('Locales');
    expect(html).toContain('Namespaces');
    expect(html).toContain('Avg Coverage');
  });

  test('renders locale cards', () => {
    const html = renderToString(<CoverageContent coverage={sampleCoverage} />);
    // Locale text is lowercase in HTML — CSS `uppercase` handles display
    expect(html).toContain('>en<');
    expect(html).toContain('>fr<');
    expect(html).toContain('>de<');
  });

  test('shows percentage values', () => {
    const html = renderToString(<CoverageContent coverage={sampleCoverage} />);
    expect(html).toContain('100%');
  });

  test('renders with single locale', () => {
    const single: CoverageEntry[] = [
      { locale: 'en', namespace: 'common', totalKeys: 5, translatedKeys: 5, percentage: 100 },
    ];
    const html = renderToString(<CoverageContent coverage={single} />);
    expect(html).toContain('>en<');
    expect(html).toContain('100');
  });

  test('shows amber for partially translated locales', () => {
    const partial: CoverageEntry[] = [
      { locale: 'fr', namespace: 'common', totalKeys: 10, translatedKeys: 9, percentage: 90 },
    ];
    const html = renderToString(<CoverageContent coverage={partial} />);
    expect(html).toContain('amber');
  });

  test('shows red for low coverage', () => {
    const low: CoverageEntry[] = [
      { locale: 'fr', namespace: 'common', totalKeys: 10, translatedKeys: 3, percentage: 30 },
    ];
    const html = renderToString(<CoverageContent coverage={low} />);
    expect(html).toContain('red');
  });
});
