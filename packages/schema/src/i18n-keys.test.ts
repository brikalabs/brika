import { describe, expect, test } from 'bun:test';
import {
  hasI18nKey,
  impliedI18nKeys,
  leafKeys,
  manifestI18nKeys,
  runtimeResolvedI18nPrefixes,
} from './i18n-keys';
import { PluginPackageSchema } from './plugin';

function pkg(extra: Record<string, unknown> = {}): PluginPackageSchema {
  return PluginPackageSchema.parse({
    name: 'test-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: '^0.4.0' },
    ...extra,
  });
}

describe('manifestI18nKeys', () => {
  test('requires entity names always, descriptions only when the manifest has one', () => {
    const keys = manifestI18nKeys(
      pkg({
        blocks: [{ id: 'play', name: 'Play', description: 'Starts', category: 'action' }],
        sparks: [{ id: 'tick' }],
      })
    );

    expect(keys).toContain('blocks.play.name');
    expect(keys).toContain('blocks.play.description');
    expect(keys).toContain('sparks.tick.name');
    expect(keys).not.toContain('sparks.tick.description');
  });

  test('requires preference titles and static dropdown option labels', () => {
    const keys = manifestI18nKeys(
      pkg({
        preferences: [
          { name: 'mode', type: 'dropdown', options: [{ value: 'fast' }, { value: 'slow' }] },
          { name: 'device', type: 'dynamic-dropdown' },
        ],
      })
    );

    expect(keys).toContain('preferences.mode.title');
    expect(keys).toContain('preferences.mode.options.fast');
    expect(keys).toContain('preferences.mode.options.slow');
    expect(keys).toContain('preferences.device.title');
    // Dynamic options are runtime-resolved, never required.
    expect(keys.some((k) => k.startsWith('preferences.device.options.'))).toBe(false);
  });

  test('requires fields.<name>.label only for schema-form blocks (no custom view)', () => {
    const keys = manifestI18nKeys(
      pkg({
        blocks: [
          { id: 'plain', name: 'Plain', category: 'action', fields: ['duration'] },
          { id: 'custom', name: 'Custom', category: 'action', view: true, fields: ['prompt'] },
        ],
      })
    );

    expect(keys).toContain('fields.duration.label');
    expect(keys).not.toContain('fields.prompt.label');
  });
});

describe('impliedI18nKeys', () => {
  test('covers descriptions and field families the UI looks up with fallbacks', () => {
    const keys = impliedI18nKeys(
      pkg({
        sparks: [{ id: 'tick' }],
        blocks: [{ id: 'custom', name: 'C', category: 'action', view: true, fields: ['prompt'] }],
      })
    );

    expect(keys).toContain('sparks.tick.description');
    expect(keys).toContain('fields.prompt.label');
    expect(keys).toContain('fields.prompt.description');
  });
});

describe('runtimeResolvedI18nPrefixes', () => {
  test('declared fields and tools get exact checking, not blanket prefixes', () => {
    const prefixes = runtimeResolvedI18nPrefixes(
      pkg({
        tools: [{ id: 'greet' }],
        blocks: [{ id: 'plain', name: 'P', category: 'action', fields: ['duration'] }],
      })
    );

    expect(prefixes).not.toContain('tools.');
    expect(prefixes).not.toContain('fields.');
    expect(prefixes).toContain('fields.duration.');
    expect(prefixes).toContain('blocks.plain.ports.');
  });

  test('manifests from older toolchains keep the blanket reservations', () => {
    // tools ABSENT (not empty) and no block carries a fields array.
    const prefixes = runtimeResolvedI18nPrefixes(
      pkg({ blocks: [{ id: 'plain', name: 'P', category: 'action' }] })
    );

    expect(prefixes).toContain('tools.');
    expect(prefixes).toContain('fields.');
  });

  test('an empty tools array means "no tools", not "unknown tools"', () => {
    expect(runtimeResolvedI18nPrefixes(pkg({ tools: [] }))).not.toContain('tools.');
  });
});

describe('bundle helpers', () => {
  test('leafKeys walks nested bundles; hasI18nKey requires non-empty strings', () => {
    const bundle = { a: { b: 'x', c: { d: 'y' } }, e: '', f: 'z' };

    expect(leafKeys(bundle).sort()).toEqual(['a.b', 'a.c.d', 'e', 'f']);
    expect(hasI18nKey(bundle, 'a.c.d')).toBe(true);
    expect(hasI18nKey(bundle, 'e')).toBe(false);
    expect(hasI18nKey(bundle, 'a.c.missing')).toBe(false);
  });
});
