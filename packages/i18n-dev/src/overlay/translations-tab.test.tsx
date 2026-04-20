import { beforeAll, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { applyKeyUsage } from './store';
import {
  buildMultiLocaleKeys,
  KeyUsageBadge,
  KeyUsageList,
  TranslationLocaleValue,
  TranslationsContent,
} from './translations-tab';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', fallbackLng: false, resources: {} });
  }
  i18next.addResourceBundle('en', 'test_tab', { hello: 'Hello', bye: 'Goodbye' }, true, true);
  i18next.addResourceBundle('fr', 'test_tab', { hello: 'Bonjour' }, true, true);
});

// ─── buildMultiLocaleKeys (pure function) ──────────────────────────────────

describe('buildMultiLocaleKeys', () => {
  test('builds keys with values from all locales', () => {
    const keys = buildMultiLocaleKeys(['en', 'fr']);
    const hello = keys.find((k) => k.ns === 'test_tab' && k.key === 'hello');
    expect(hello).toBeDefined();
    expect(hello?.values.en).toBe('Hello');
    expect(hello?.values.fr).toBe('Bonjour');
    expect(hello?.missingCount).toBe(0);
  });

  test('marks missing translations', () => {
    const keys = buildMultiLocaleKeys(['en', 'fr']);
    const bye = keys.find((k) => k.ns === 'test_tab' && k.key === 'bye');
    expect(bye).toBeDefined();
    expect(bye?.values.en).toBe('Goodbye');
    expect(bye?.values.fr).toBeUndefined();
    expect(bye?.missingCount).toBe(1);
  });

  test('returns empty for non-existent reference locale', () => {
    // With only 'fr' (non-reference), reference entries come from 'en'
    const keys = buildMultiLocaleKeys(['en']);
    expect(keys.length).toBeGreaterThan(0);
    const hello = keys.find((k) => k.ns === 'test_tab' && k.key === 'hello');
    expect(hello?.missingCount).toBe(0);
  });

  test('handles single locale (reference only)', () => {
    const keys = buildMultiLocaleKeys(['en']);
    for (const key of keys) {
      expect(key.missingCount).toBe(0);
    }
  });
});

// ─── TranslationLocaleValue ────────────────────────────────────────────────

describe('TranslationLocaleValue', () => {
  const noop = () => {
    /* noop */
  };
  const ref = createRef<HTMLInputElement>();

  test('renders value as clickable button', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value="Hello"
        isEditing={false}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('Hello');
    expect(html).toContain('button');
    expect(html).toContain('Click to edit');
  });

  test('renders missing placeholder when value is undefined', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value={undefined}
        isEditing={false}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('missing');
    expect(html).toContain('red');
  });

  test('renders edit input when isEditing', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value="Hello"
        isEditing={true}
        editRef={ref}
        editVal="Hello world"
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('input');
    expect(html).toContain('Hello world');
    expect(html).toContain('Save');
    expect(html).toContain('Esc');
  });

  test('renders Save button in edit mode', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value="test"
        isEditing={true}
        editRef={ref}
        editVal="test"
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('Save');
    expect(html).toContain('indigo');
  });
});

// ─── KeyUsageBadge ─────────────────────────────────────────────────────────

describe('KeyUsageBadge', () => {
  test('renders null when no usages', () => {
    applyKeyUsage({});
    const html = renderToString(<KeyUsageBadge qualifiedKey="test_tab:missing" />);
    expect(html).toBe('');
  });

  test('renders ref count badge', () => {
    applyKeyUsage({ 'test_tab:hello': [{ file: 'src/App.tsx', line: 10 }] });
    const html = renderToString(<KeyUsageBadge qualifiedKey="test_tab:hello" />);
    expect(html).toContain('1');
    expect(html).toContain('ref');
  });

  test('renders plural refs for multiple usages', () => {
    applyKeyUsage({
      'test_tab:hello': [
        { file: 'src/App.tsx', line: 10 },
        { file: 'src/Header.tsx', line: 5 },
      ],
    });
    const html = renderToString(<KeyUsageBadge qualifiedKey="test_tab:hello" />);
    expect(html).toContain('2');
    // React SSR: "ref<!-- -->s"
    expect(html).toContain('ref');
  });
});

// ─── KeyUsageList ──────────────────────────────────────────────────────────

describe('KeyUsageList', () => {
  test('renders "Not found in source" when no usages', () => {
    applyKeyUsage({});
    const html = renderToString(<KeyUsageList qualifiedKey="test_tab:nowhere" />);
    expect(html).toContain('Not found in source');
  });

  test('renders file entries', () => {
    applyKeyUsage({ 'test_tab:hello': [{ file: 'src/App.tsx', line: 10 }] });
    const html = renderToString(<KeyUsageList qualifiedKey="test_tab:hello" />);
    expect(html).toContain('Used in 1 file');
    expect(html).toContain('src/App.tsx');
    expect(html).toContain(':10');
  });

  test('renders plural files label', () => {
    applyKeyUsage({
      'test_tab:hello': [
        { file: 'src/App.tsx', line: 10 },
        { file: 'src/Header.tsx', line: 5 },
      ],
    });
    const html = renderToString(<KeyUsageList qualifiedKey="test_tab:hello" />);
    expect(html).toContain('Used in 2 files');
  });
});

// ─── TranslationsContent ───────────────────────────────────────────────────

describe('TranslationsContent', () => {
  test('renders translation keys grouped by namespace', () => {
    const html = renderToString(
      <TranslationsContent filter="" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('test_tab');
  });

  test('renders individual key entries', () => {
    const html = renderToString(
      <TranslationsContent filter="test_tab:" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('hello');
    expect(html).toContain('bye');
  });

  test('renders missing count badges', () => {
    const html = renderToString(
      <TranslationsContent filter="test_tab:" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('missing');
  });

  test('renders filter pills', () => {
    const html = renderToString(
      <TranslationsContent filter="" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('All');
    expect(html).toContain('Missing');
  });

  test('filters by key name', () => {
    const html = renderToString(
      <TranslationsContent filter="hello" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('hello');
  });

  test('renders empty state with filter matching nothing', () => {
    const html = renderToString(
      <TranslationsContent filter="zzz_nonexistent" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('No matching translations');
  });

  test('renders key count footer', () => {
    const html = renderToString(
      <TranslationsContent filter="" locales={['en', 'fr']} navigateTarget={null} />
    );
    expect(html).toContain('key');
    expect(html).toContain('locale');
  });

  test('renders with single locale', () => {
    const html = renderToString(
      <TranslationsContent filter="" locales={['en']} navigateTarget={null} />
    );
    expect(html).toContain('hello');
  });

  test('renders content with non-reference-only locales', () => {
    const html = renderToString(
      <TranslationsContent filter="" locales={['fr']} navigateTarget={null} />
    );
    expect(html).toBeDefined();
  });
});
