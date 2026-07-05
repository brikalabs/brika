import { describe, expect, test } from 'bun:test';
import { PluginPackageSchema } from '@brika/schema/plugin';
import { extractI18nKeys } from '../plugins/i18n-call-site/keys';
import { analyzeI18nUsage, scanI18nUsage } from './i18n-usage';

describe('extractI18nKeys', () => {
  test('reads exact keys from string and interpolation-free template literals', () => {
    const usage = extractI18nKeys(
      [
        "const a = t('player.title');",
        'const b = t("player.login");',
        'const c = t(`player.noResults`);',
        "const d = t('ui.hello', { defaultValue: 'Hi' });",
      ].join('\n')
    );

    expect(usage.exact.map((u) => u.key)).toEqual([
      'player.title',
      'player.login',
      'player.noResults',
      'ui.hello',
    ]);
    expect(usage.patterns).toEqual([]);
    expect(usage.dynamic).toBe(0);
  });

  test('turns template interpolations into * patterns, with line numbers', () => {
    const usage = extractI18nKeys(
      [
        'const a = t(`conditions.${code}`);',
        'const b = t(`fields.${name}.label`);',
        'const c = t(`x.${a}${b}.y`);', // consecutive interpolations collapse
      ].join('\n')
    );

    expect(usage.patterns).toEqual([
      { key: 'conditions.*', line: 1 },
      { key: 'fields.*.label', line: 2 },
      { key: 'x.*.y', line: 3 },
    ]);
  });

  test('counts non-literal keys as dynamic', () => {
    const usage = extractI18nKeys(
      ['t(someVariable);', 't(key(), {});', 't(`${whole}`);', "t('lit.' + rest);"].join('\n')
    );

    expect(usage.exact).toEqual([]);
    expect(usage.dynamic).toBe(4);
  });

  test('reads tp() keys from the second argument', () => {
    const usage = extractI18nKeys("tp('@scope/plug', 'blocks.play.name', 'Play');");

    expect(usage.exact).toEqual([{ key: 'blocks.play.name', line: 1 }]);
  });

  test('ignores calls in strings, comments, templates and member expressions', () => {
    const usage = extractI18nKeys(
      [
        "// t('comment.key')",
        "/* t('block.key') */",
        'const s = "t(\'string.key\')";',
        "obj.t('member.key');",
        "maybe?.t('optional.key');",
        "const tpl = `t('template.key')`;",
      ].join('\n')
    );

    expect(usage.exact).toEqual([]);
    expect(usage.patterns).toEqual([]);
    expect(usage.dynamic).toBe(0);
  });
});

describe('scanI18nUsage', () => {
  test('aggregates across files with file:line sites, skipping tests', () => {
    const usage = scanI18nUsage(
      new Map([
        ['src/pages/a.tsx', "t('ui.hello');\nt('ui.hello');"],
        ['src/bricks/b.tsx', "t('ui.bye');"],
        ['src/pages/a.test.tsx', "t('ui.only-in-test');"],
        ['icon.svg', "t('not.source');"],
      ])
    );

    expect(usage.exact.get('ui.hello')).toEqual(['src/pages/a.tsx:1', 'src/pages/a.tsx:2']);
    expect(usage.exact.get('ui.bye')).toEqual(['src/bricks/b.tsx:1']);
    expect(usage.exact.has('ui.only-in-test')).toBe(false);
    expect(usage.exact.has('not.source')).toBe(false);
  });
});

describe('analyzeI18nUsage', () => {
  const pkg = PluginPackageSchema.parse({
    name: 'test-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: '^0.4.0' },
    displayName: 'Test',
    blocks: [{ id: 'play', name: 'Play', category: 'action' }],
    preferences: [{ name: 'device', type: 'dynamic-dropdown' }],
  });

  const bundle = (data: Record<string, unknown>) => new Map([['en', data]]);

  test('errors on an exact key present in no locale', () => {
    const usage = scanI18nUsage(new Map([['src/pages/a.tsx', "t('ui.missing');"]]));

    const { errors } = analyzeI18nUsage(usage, pkg, bundle({ name: 'Test' }));

    expect(errors).toEqual([
      'i18n key "ui.missing" (used at src/pages/a.tsx:1) exists in no locale',
    ]);
  });

  test('accepts a key present in any one locale', () => {
    const usage = scanI18nUsage(new Map([['src/pages/a.tsx', "t('ui.hello');"]]));
    const bundles = new Map<string, Record<string, unknown>>([
      ['en', {}],
      ['fr', { ui: { hello: 'Bonjour' } }],
    ]);

    const { errors } = analyzeI18nUsage(usage, pkg, bundles);

    expect(errors).toEqual([]);
  });

  test('warns on a pattern matching no locale key, accepts one that matches', () => {
    const usage = scanI18nUsage(
      new Map([['src/pages/a.tsx', 't(`conditions.${c}`);\nt(`ghost.${g}`);']])
    );

    const { errors, warnings } = analyzeI18nUsage(
      usage,
      pkg,
      bundle({ conditions: { sunny: 'Sunny' } })
    );

    expect(errors).toEqual([]);
    expect(
      warnings.some((w) => w.includes('"ghost.*"') && w.includes('matches no locale key'))
    ).toBe(true);
    expect(warnings.some((w) => w.includes('"conditions.*"'))).toBe(false);
  });

  test('warns on locale keys nothing references, sparing manifest and runtime-resolved keys', () => {
    const usage = scanI18nUsage(new Map([['src/pages/a.tsx', "t('ui.hello');"]]));

    const { warnings } = analyzeI18nUsage(
      usage,
      pkg,
      bundle({
        name: 'Test',
        title: 'Store title',
        blocks: { play: { name: 'Play' } },
        preferences: { device: { title: 'Device', options: { kitchen: 'Kitchen' } } },
        fields: { volume: { label: 'Volume' } },
        ui: { hello: 'Hello' },
        stale: { key: 'Old' },
      })
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('stale.key');
    expect(warnings[0]).not.toContain('fields.volume');
    expect(warnings[0]).not.toContain('options.kitchen');
  });

  test('reports nothing when the plugin ships no locales (setup is check-i18n territory)', () => {
    const usage = scanI18nUsage(new Map([['src/pages/a.tsx', "t('ui.hello');"]]));

    const result = analyzeI18nUsage(usage, pkg, new Map());

    expect(result).toEqual({ errors: [], warnings: [] });
  });
});
