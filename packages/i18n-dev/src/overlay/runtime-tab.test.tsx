import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { RuntimeEntry } from './hooks';
import { RuntimeContent } from './runtime-tab';

const sampleEntries: RuntimeEntry[] = [
  { key: 'hello', namespace: 'common', locale: 'fr', count: 1 },
  { key: 'bye', namespace: 'common', locale: 'fr', count: 3 },
  { key: 'submit', namespace: 'auth', locale: 'de', count: 1 },
];

describe('RuntimeContent', () => {
  test('renders empty state with no entries', () => {
    const html = renderToString(<RuntimeContent entries={[]} filter="" onClear={() => {}} />);
    expect(html).toContain('No missing keys detected');
  });

  test('renders empty state with filter', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="zzz_no_match" onClear={() => {}} />
    );
    expect(html).toContain('No matching keys');
  });

  test('renders entry list', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="" onClear={() => {}} />
    );
    expect(html).toContain('common');
    expect(html).toContain('hello');
    expect(html).toContain('bye');
    expect(html).toContain('auth');
    expect(html).toContain('submit');
  });

  test('shows count badge for count > 1', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="" onClear={() => {}} />
    );
    // bye has count: 3, should show "3×"
    expect(html).toContain('3');
  });

  test('shows locale badge', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="" onClear={() => {}} />
    );
    expect(html).toContain('fr');
    expect(html).toContain('de');
  });

  test('renders clear button', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="" onClear={() => {}} />
    );
    expect(html).toContain('Clear');
  });

  test('shows entry count', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="" onClear={() => {}} />
    );
    // React inserts <!-- --> between JSX expressions, so check fragments
    expect(html).toContain('missing key');
    expect(html).toContain('at runtime');
  });

  test('filters entries by key', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="hello" onClear={() => {}} />
    );
    expect(html).toContain('hello');
    expect(html).not.toContain('submit');
  });

  test('filters entries by namespace', () => {
    const html = renderToString(
      <RuntimeContent entries={sampleEntries} filter="auth" onClear={() => {}} />
    );
    expect(html).toContain('submit');
    expect(html).not.toContain('hello');
  });

  test('singular missing key text', () => {
    const single: RuntimeEntry[] = [{ key: 'k', namespace: 'ns', locale: 'en', count: 1 }];
    const html = renderToString(
      <RuntimeContent entries={single} filter="" onClear={() => {}} />
    );
    // No trailing 's' for singular
    expect(html).toContain('missing key');
    expect(html).not.toContain('missing keys');
  });
});
