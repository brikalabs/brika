import { describe, expect, mock, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import {
  detectFileIndent,
  detectIndentFromContent,
  loadLocaleFolder,
  loadMergedLocaleFolder,
  pickPrimaryLocaleFile,
} from './loaders';

const bun = useBunMock();

describe('loadLocaleFolder', () => {
  test('reads each JSON file into a namespace keyed by filename', async () => {
    bun
      .fs({
        '/locales/en/common.json': { hello: 'Hello' },
        '/locales/en/nav.json': { home: 'Home' },
      })
      .apply();

    const result = await loadLocaleFolder('/locales/en');

    expect(result).toEqual({
      common: { hello: 'Hello' },
      nav: { home: 'Home' },
    });
  });

  test('returns empty object for missing folder', async () => {
    bun.fs({}).apply();

    const result = await loadLocaleFolder('/does/not/exist');

    expect(result).toEqual({});
  });

  test('calls warn and skips files when root JSON is not an object', async () => {
    bun
      .fs({
        '/locales/en/scalar.json': 'just a string',
        '/locales/en/good.json': { key: 'value' },
      })
      .apply();

    const warn = mock();
    const result = await loadLocaleFolder('/locales/en', warn);

    expect(result).toEqual({ good: { key: 'value' } });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('loadMergedLocaleFolder', () => {
  test('merges all JSON files in a folder into one flat namespace', async () => {
    bun
      .fs({
        '/folder/locales/en/strings.json': { hello: 'Hello' },
        '/folder/locales/en/blocks.json': { title: 'Block' },
      })
      .apply();

    const result = await loadMergedLocaleFolder('/folder/locales/en');

    expect(result.data).toEqual({
      hello: 'Hello',
      title: 'Block',
    });
  });

  test('deep-merges overlapping branches across files', async () => {
    bun
      .fs({
        '/folder/locales/en/a.json': { ui: { title: 'A', shared: 'first' } },
        '/folder/locales/en/b.json': { ui: { shared: 'second', extra: 'B' } },
      })
      .apply();

    const result = await loadMergedLocaleFolder('/folder/locales/en');

    expect(result.data).toEqual({
      ui: { title: 'A', shared: 'second', extra: 'B' },
    });
  });

  test('records per-leaf provenance with last-write-wins semantics', async () => {
    bun
      .fs({
        '/folder/locales/en/a.json': { ui: { title: 'A', shared: 'first' } },
        '/folder/locales/en/b.json': { ui: { shared: 'second', extra: 'B' } },
      })
      .apply();

    const result = await loadMergedLocaleFolder('/folder/locales/en');

    expect(result.keyOrigins.get('ui.title')).toBe('/folder/locales/en/a.json');
    expect(result.keyOrigins.get('ui.shared')).toBe('/folder/locales/en/b.json');
    expect(result.keyOrigins.get('ui.extra')).toBe('/folder/locales/en/b.json');
    expect(result.contributingFiles).toEqual([
      '/folder/locales/en/a.json',
      '/folder/locales/en/b.json',
    ]);
  });

  test('returns empty data for missing folder', async () => {
    bun.fs({}).apply();

    const result = await loadMergedLocaleFolder('/missing');

    expect(result.data).toEqual({});
    expect(result.contributingFiles).toEqual([]);
  });

  test('calls warn when a file root is not an object', async () => {
    bun
      .fs({
        '/folder/locales/en/bad.json': ['array', 'root'],
        '/folder/locales/en/good.json': { hello: 'Hi' },
      })
      .apply();

    const warn = mock();
    const result = await loadMergedLocaleFolder('/folder/locales/en', warn);

    expect(result.data).toEqual({ hello: 'Hi' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('detectFileIndent', () => {
  test('detects tab indentation', async () => {
    bun
      .fs({
        '/a.json': '{\n\t"key": "val"\n}',
      })
      .apply();

    expect(await detectFileIndent('/a.json')).toBe('\t');
  });

  test('detects two-space indentation', async () => {
    bun
      .fs({
        '/a.json': '{\n  "key": "val"\n}',
      })
      .apply();

    expect(await detectFileIndent('/a.json')).toBe(2);
  });

  test('detects four-space indentation', async () => {
    bun
      .fs({
        '/a.json': '{\n    "key": "val"\n}',
      })
      .apply();

    expect(await detectFileIndent('/a.json')).toBe(4);
  });

  test('falls back to 2 spaces for a file with no line break', async () => {
    bun
      .fs({
        '/a.json': '{"a":"b"}',
      })
      .apply();

    expect(await detectFileIndent('/a.json')).toBe(2);
  });

  test('falls back to 2 spaces for a missing / unreadable file', async () => {
    bun.fs({}).apply();

    expect(await detectFileIndent('/missing.json')).toBe(2);
  });
});

describe('detectIndentFromContent', () => {
  test('detects tab indentation directly from string content', () => {
    expect(detectIndentFromContent('{\n\t"k": "v"\n}')).toBe('\t');
  });

  test('detects two-space indentation', () => {
    expect(detectIndentFromContent('{\n  "k": "v"\n}')).toBe(2);
  });

  test('detects four-space indentation', () => {
    expect(detectIndentFromContent('{\n    "k": "v"\n}')).toBe(4);
  });

  test('falls back to 2 spaces for content with no line break', () => {
    expect(detectIndentFromContent('{"a":"b"}')).toBe(2);
  });

  test('falls back to 2 spaces when the newline is the very last character', () => {
    expect(detectIndentFromContent('{"a":"b"}\n')).toBe(2);
  });

  test('falls back to 2 spaces when the line after a newline is not whitespace-indented', () => {
    // The next character after `\n` is `"` — neither tab nor space, so the
    // detector returns the 2-space fallback rather than guessing.
    expect(detectIndentFromContent('{\n"k": "v"\n}')).toBe(2);
  });
});

describe('pickPrimaryLocaleFile', () => {
  test('returns the preferred basename when it exists', async () => {
    bun
      .fs({
        '/locales/en/common.json': { hello: 'Hello' },
        '/locales/en/other.json': { x: 'y' },
      })
      .apply();

    expect(await pickPrimaryLocaleFile('/locales/en', 'common')).toBe('/locales/en/common.json');
  });

  test('falls back to the alphabetically-first file when the preferred one is missing', async () => {
    bun
      .fs({
        '/locales/en/zeta.json': { z: '1' },
        '/locales/en/alpha.json': { a: '1' },
        '/locales/en/beta.json': { b: '1' },
      })
      .apply();

    expect(await pickPrimaryLocaleFile('/locales/en', 'common')).toBe('/locales/en/alpha.json');
  });

  test('returns null when no JSON files exist in the folder', async () => {
    bun.fs({ '/locales/en/.keep': '' }).apply();

    expect(await pickPrimaryLocaleFile('/locales/en', 'common')).toBeNull();
  });

  test('returns null for a missing folder', async () => {
    bun.fs({}).apply();

    expect(await pickPrimaryLocaleFile('/does/not/exist', 'common')).toBeNull();
  });
});
