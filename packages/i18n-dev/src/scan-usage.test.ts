import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOURCE_EXTENSIONS, scanKeyUsages } from './scan-usage';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'i18n-usage-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeSource(relativePath: string, content: string) {
  const fullPath = join(tempDir, relativePath);
  await mkdir(join(fullPath, '..'), { recursive: true });
  await writeFile(fullPath, content);
}

// ─── SOURCE_EXTENSIONS ────────────────────────────────────────────────────

describe('SOURCE_EXTENSIONS', () => {
  test('contains expected file extensions', () => {
    expect(SOURCE_EXTENSIONS.has('.ts')).toBe(true);
    expect(SOURCE_EXTENSIONS.has('.tsx')).toBe(true);
    expect(SOURCE_EXTENSIONS.has('.js')).toBe(true);
    expect(SOURCE_EXTENSIONS.has('.jsx')).toBe(true);
    expect(SOURCE_EXTENSIONS.has('.json')).toBe(true);
    expect(SOURCE_EXTENSIONS.has('.css')).toBe(false);
  });
});

// ─── scanKeyUsages ────────────────────────────────────────────────────────

describe('scanKeyUsages', () => {
  test('empty directory returns empty map', async () => {
    const srcDir = join(tempDir, 'src');
    await mkdir(srcDir, { recursive: true });

    const result = await scanKeyUsages(tempDir, [{ dir: srcDir }]);
    expect(result).toEqual({});
  });

  test("t('key') single-quote calls are detected with correct file and line", async () => {
    await writeSource(
      'src/app.ts',
      [
        'import { useTranslation } from "react-i18next";',
        '',
        "const label = t('greeting');",
        "const other = t('farewell');",
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['greeting']).toBeDefined();
    expect(result['greeting']).toHaveLength(1);
    expect(result['greeting'][0]).toEqual({ file: 'src/app.ts', line: 3 });

    expect(result['farewell']).toBeDefined();
    expect(result['farewell']).toHaveLength(1);
    expect(result['farewell'][0]).toEqual({ file: 'src/app.ts', line: 4 });
  });

  test('t("key") double-quote calls work', async () => {
    await writeSource(
      'src/comp.tsx',
      ['function Comp() {', '  return <p>{t("hello.world")}</p>;', '}'].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['hello.world']).toBeDefined();
    expect(result['hello.world']).toHaveLength(1);
    expect(result['hello.world'][0]).toEqual({ file: 'src/comp.tsx', line: 2 });
  });

  test('t(`key`) template literal calls work', async () => {
    await writeSource(
      'src/tpl.ts',
      ['const a = t(`static.key`);', 'const b = t(`another`);'].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['static.key']).toBeDefined();
    expect(result['static.key'][0]).toEqual({ file: 'src/tpl.ts', line: 1 });

    expect(result['another']).toBeDefined();
    expect(result['another'][0]).toEqual({ file: 'src/tpl.ts', line: 2 });
  });

  test('t(`key`) skips dynamic template literals with interpolation', async () => {
    await writeSource(
      'src/dynamic.ts',
      ['const a = t(`prefix.${variable}`);', 'const b = t(`static.only`);'].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    // Dynamic template literal should be skipped
    expect(result['prefix.']).toBeUndefined();
    // Static template literal should be detected
    expect(result['static.only']).toBeDefined();
  });

  test("useTranslation('ns') sets default namespace for bare keys", async () => {
    await writeSource(
      'src/page.tsx',
      [
        'import { useTranslation } from "react-i18next";',
        '',
        'function Page() {',
        "  const { t } = useTranslation('dashboard');",
        "  return <p>{t('title')}</p>;",
        '}',
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    // Bare key 'title' should be qualified with 'dashboard:'
    expect(result['dashboard:title']).toBeDefined();
    expect(result['dashboard:title']).toHaveLength(1);
    expect(result['dashboard:title'][0]).toEqual({ file: 'src/page.tsx', line: 5 });
  });

  test('qualified keys (ns:key) bypass the default namespace', async () => {
    await writeSource(
      'src/mixed.tsx',
      [
        "const { t } = useTranslation('dashboard');",
        "t('bare.key');",
        "t('other:qualified.key');",
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    // Bare key gets dashboard: prefix
    expect(result['dashboard:bare.key']).toBeDefined();
    expect(result['dashboard:bare.key'][0]).toEqual({ file: 'src/mixed.tsx', line: 2 });

    // Qualified key retains its own namespace
    expect(result['other:qualified.key']).toBeDefined();
    expect(result['other:qualified.key'][0]).toEqual({ file: 'src/mixed.tsx', line: 3 });
  });

  test('JSON $t(ns:key) cross-references detected', async () => {
    await writeSource(
      'src/locales/en/common.json',
      JSON.stringify(
        {
          greeting: 'Hello',
          ref: '$t(dashboard:stats.count)',
          multi: 'See $t(auth:login) and $t(auth:register)',
        },
        null,
        2
      )
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src/locales') }]);

    expect(result['dashboard:stats.count']).toBeDefined();
    expect(result['dashboard:stats.count']).toHaveLength(1);
    expect(result['dashboard:stats.count'][0].file).toBe('src/locales/en/common.json');

    expect(result['auth:login']).toBeDefined();
    expect(result['auth:register']).toBeDefined();
  });

  test('JSON "ns:dotted.key" qualified strings detected', async () => {
    await writeSource(
      'src/config.json',
      JSON.stringify(
        {
          fallback: 'common:errors.notFound',
          reference: 'dashboard:stats.total',
        },
        null,
        2
      )
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['common:errors.notFound']).toBeDefined();
    expect(result['common:errors.notFound']).toHaveLength(1);
    expect(result['common:errors.notFound'][0].file).toBe('src/config.json');

    expect(result['dashboard:stats.total']).toBeDefined();
  });

  test('node_modules directories are skipped', async () => {
    await writeSource('src/real.ts', "t('found');");
    await writeSource('src/node_modules/lib/index.ts', "t('should.be.skipped');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['found']).toBeDefined();
    expect(result['should.be.skipped']).toBeUndefined();
  });

  test('dist and build directories are skipped', async () => {
    await writeSource('src/real.ts', "t('visible');");
    await writeSource('src/dist/bundle.js', "t('hidden.dist');");
    await writeSource('src/build/output.js', "t('hidden.build');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['visible']).toBeDefined();
    expect(result['hidden.dist']).toBeUndefined();
    expect(result['hidden.build']).toBeUndefined();
  });

  test('deduplicates same key on same file:line', async () => {
    // Two identical t('key') calls on the same line should produce only one usage entry
    await writeSource('src/dup.ts', "const x = t('dup') + t('dup');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['dup']).toBeDefined();
    expect(result['dup']).toHaveLength(1);
    expect(result['dup'][0]).toEqual({ file: 'src/dup.ts', line: 1 });
  });

  test('same key on different lines produces multiple usages', async () => {
    await writeSource(
      'src/multi.ts',
      ["t('repeated');", '// comment', "t('repeated');"].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['repeated']).toBeDefined();
    expect(result['repeated']).toHaveLength(2);
    expect(result['repeated'][0]).toEqual({ file: 'src/multi.ts', line: 1 });
    expect(result['repeated'][1]).toEqual({ file: 'src/multi.ts', line: 3 });
  });

  test('scans multiple source roots', async () => {
    await writeSource('app/src/page.ts', "t('app.key');");
    await writeSource('lib/src/util.ts', "t('lib.key');");

    const result = await scanKeyUsages(tempDir, [
      { dir: join(tempDir, 'app/src') },
      { dir: join(tempDir, 'lib/src') },
    ]);

    expect(result['app.key']).toBeDefined();
    expect(result['app.key'][0].file).toBe('app/src/page.ts');

    expect(result['lib.key']).toBeDefined();
    expect(result['lib.key'][0].file).toBe('lib/src/util.ts');
  });

  test('handles non-existent srcDir gracefully', async () => {
    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'does-not-exist') }]);
    expect(result).toEqual({});
  });

  test('files produce relative paths from rootDir', async () => {
    await writeSource('deep/nested/dir/file.tsx', "t('deep.key');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'deep') }]);

    expect(result['deep.key']).toBeDefined();
    expect(result['deep.key'][0].file).toBe('deep/nested/dir/file.tsx');
  });

  test('paths are workspace-relative when rootDir is the monorepo root', async () => {
    // Mirror brika's layout: app under apps/<x>, plugins under plugins/<y>.
    // When the host passes the workspace root as `rootDir`, paths come out
    // with no `../` prefix — matching the compiler-injected `__cs` field
    // (also workspace-root relative). That alignment lets the overlay's
    // static-scan + runtime-capture dedup work by `file:line` string equality.
    await writeSource('apps/ui/src/main.tsx', "t('common:hello');");
    await writeSource('plugins/weather/src/bricks/compact.tsx', "t('plugin:weather:current');");

    const result = await scanKeyUsages(tempDir, [
      { dir: join(tempDir, 'apps/ui/src') },
      { dir: join(tempDir, 'plugins/weather'), namespace: 'plugin:weather' },
    ]);

    expect(result['common:hello']).toBeDefined();
    expect(result['common:hello'][0].file).toBe('apps/ui/src/main.tsx');

    expect(result['plugin:weather:current']).toBeDefined();
    expect(result['plugin:weather:current'][0].file).toBe('plugins/weather/src/bricks/compact.tsx');
    // Defensive: paths must not escape the rootDir via `..`
    for (const usages of Object.values(result)) {
      for (const u of usages) {
        expect(u.file.startsWith('..')).toBe(false);
      }
    }
  });

  test('ignores files with non-source extensions', async () => {
    await writeSource('src/style.css', "/* t('not.detected') */");
    await writeSource('src/data.yaml', "key: t('also.not.detected')");
    await writeSource('src/real.ts', "t('detected');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['not.detected']).toBeUndefined();
    expect(result['also.not.detected']).toBeUndefined();
    expect(result['detected']).toBeDefined();
  });

  test('hidden directories (starting with dot) are skipped', async () => {
    await writeSource('src/.hidden/secret.ts', "t('hidden.key');");
    await writeSource('src/visible.ts', "t('visible.key');");

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['hidden.key']).toBeUndefined();
    expect(result['visible.key']).toBeDefined();
  });

  test('t call with whitespace variations', async () => {
    await writeSource(
      'src/whitespace.ts',
      ["t( 'spaced' );", 't(  "double.spaced"  );', 't(`tpl.spaced`);'].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['spaced']).toBeDefined();
    expect(result['double.spaced']).toBeDefined();
    expect(result['tpl.spaced']).toBeDefined();
  });

  test("tp('id', 'key') expands to <id>:<key>", async () => {
    await writeSource(
      'src/widget.tsx',
      [
        "const a = tp('@brika/plugin-weather', 'stats.feelsLike');",
        'const b = tp("@brika/plugin-timer", "controls.start");',
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['@brika/plugin-weather:stats.feelsLike']).toBeDefined();
    expect(result['@brika/plugin-timer:controls.start']).toBeDefined();
  });

  test('tp template-literal form also works', async () => {
    await writeSource(
      'src/widget.tsx',
      ['const v = tp(`@brika/plugin-weather`, `stats.feelsLike`);'].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['@brika/plugin-weather:stats.feelsLike']).toBeDefined();
  });

  test('JSON cross-refs to qualified namespaces detected', async () => {
    // The walker skips `locales/` by default, so place the JSON elsewhere.
    await writeSource(
      'data/common.json',
      [
        '{',
        '  "description": "$t(plugin:@brika/plugin-weather:stats.feelsLike)",',
        '  "fallback": "plugin:@brika/plugin-timer:controls.start"',
        '}',
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'data') }]);

    expect(result['plugin:@brika/plugin-weather:stats.feelsLike']).toBeDefined();
    expect(result['plugin:@brika/plugin-timer:controls.start']).toBeDefined();
  });

  test('false-positive identifiers (cat, assert, _t, setUseTranslation) ignored', async () => {
    await writeSource(
      'src/falsy.ts',
      [
        "cat('not.a.translation');",
        "assert('not.a.translation');",
        "_t('not.a.translation');",
        "setUseTranslation('not.a.namespace');",
        "t('real.key');",
      ].join('\n')
    );

    const result = await scanKeyUsages(tempDir, [{ dir: join(tempDir, 'src') }]);

    expect(result['not.a.translation']).toBeUndefined();
    expect(result['not.a.namespace']).toBeUndefined();
    expect(result['real.key']).toBeDefined();
  });

  test('namespace from SourceConfig used for bare-key calls when no useTranslation in file', async () => {
    await writeSource('src/comp.tsx', "t('bare.key');");

    const result = await scanKeyUsages(tempDir, [
      { dir: join(tempDir, 'src'), namespace: 'plugin:my-plugin' },
    ]);

    expect(result['plugin:my-plugin:bare.key']).toBeDefined();
  });
});
