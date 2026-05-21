import { beforeAll, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import type { MultiLocaleKey } from './multi-locale';
import { setReferenceLocale } from './store';
import { TranslationKeyExpanded, TranslationLocaleValue } from './translation-row';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', fallbackLng: false, resources: {} });
  }
  setReferenceLocale('en');
});

const noop = () => {
  /* noop */
};

// ─── TranslationLocaleValue: covers the missing display branch ─────────────

describe('TranslationLocaleValue (display branch)', () => {
  const ref = createRef<HTMLInputElement>();

  test('shows VariableHighlight content inside the click-to-edit button', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value="Welcome {{name}}"
        isEditing={false}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('Welcome');
    expect(html).toContain('Click to edit');
  });

  test('cancel button is rendered while editing', () => {
    const html = renderToString(
      <TranslationLocaleValue
        value="hi"
        isEditing={true}
        editRef={ref}
        editVal="hi"
        onEditChange={noop}
        onSave={noop}
        onCancel={noop}
        onStartEdit={noop}
      />
    );
    expect(html).toContain('Esc');
  });
});

// ─── TranslationKeyExpanded ────────────────────────────────────────────────

const sampleEntry: MultiLocaleKey = {
  ns: 'tab',
  key: 'hello',
  values: { en: 'Hello', fr: 'Bonjour', de: undefined },
  missingCount: 1,
};

describe('TranslationKeyExpanded — locale rows', () => {
  const ref = createRef<HTMLInputElement>();

  test('renders one row per locale with locale code prefix', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr', 'de']}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).toContain('en');
    expect(html).toContain('fr');
    expect(html).toContain('de');
  });

  test('renders the values present in each locale and missing placeholder for the others', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr', 'de']}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).toContain('Hello');
    expect(html).toContain('Bonjour');
    expect(html).toContain('missing');
  });

  test('highlights the reference locale label with indigo class', () => {
    setReferenceLocale('en');
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr']}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).toContain('indigo');
  });

  test('non-reference locale labels use the dt-text-3 color class', () => {
    setReferenceLocale('en');
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr']}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).toContain('dt-text-3');
  });

  test('renders edit input for the locale being edited', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr']}
        editTarget={{ id: 'tab:hello', locale: 'fr' }}
        editRef={ref}
        editVal="Bonjour le monde"
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).toContain('input');
    expect(html).toContain('Bonjour le monde');
    expect(html).toContain('Save');
  });

  test('does not render edit input when editTarget id does not match', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en', 'fr']}
        editTarget={{ id: 'tab:other', locale: 'fr' }}
        editRef={ref}
        editVal="should not appear"
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    expect(html).not.toContain('should not appear');
  });

  test('includes the KeyUsageList footer', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={['en']}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    // KeyUsageList renders either "Used in N file(s)" or "Not found in source"
    expect(html).toMatch(/Used in|Not found in source/);
  });

  test('renders nothing in the body when locales array is empty', () => {
    const html = renderToString(
      <TranslationKeyExpanded
        entry={sampleEntry}
        eId="tab:hello"
        locales={[]}
        editTarget={null}
        editRef={ref}
        editVal=""
        onEditChange={noop}
        onSave={noop}
        onCancelEdit={noop}
        onStartEdit={noop}
        onEditValChange={noop}
      />
    );
    // No locale code prefix div should be rendered
    expect(html).not.toContain('Hello');
    expect(html).not.toContain('Bonjour');
  });
});
