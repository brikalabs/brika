import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaI18nCallSitePlugin } from '../plugins/i18n-call-site';

describe('brikaI18nCallSitePlugin', () => {
  let tmpDir: string;
  let outdir: string;

  beforeEach(async () => {
    tmpDir = await realpath(await mkdtemp(join(tmpdir(), 'brika-i18n-cs-')));
    outdir = join(tmpDir, 'dist');
    await mkdir(outdir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function buildFile(
    fileName: string,
    content: string,
    sourceRoot: string = tmpDir
  ): Promise<string> {
    const entryPath = join(tmpDir, fileName);
    await writeFile(entryPath, content);
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      minify: false,
      plugins: [brikaI18nCallSitePlugin(sourceRoot)],
    });
    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }
    return Bun.file(join(outdir, fileName.replace(/\.tsx?$/, '.js'))).text();
  }

  // ── Single-arg t() calls ──

  test('rewrites t("key") with single-quoted string', async () => {
    const out = await buildFile('a.ts', `export const x = t('hello');\n`);
    expect(out).toContain('__cs');
    expect(out).toContain('a.ts:1');
  });

  test('rewrites t("key") with double-quoted string', async () => {
    const out = await buildFile('a.ts', `export const x = t("hello");\n`);
    expect(out).toContain('__cs');
    expect(out).toContain('a.ts:1');
  });

  test('rewrites t(`key`) with template literal', async () => {
    const out = await buildFile('a.ts', `export const x = t(\`hello\`);\n`);
    expect(out).toContain('__cs');
    expect(out).toContain('a.ts:1');
  });

  test('line numbers reflect the original source position', async () => {
    const src = ['', '', `export const x = t('hello');`, ''].join('\n');
    const out = await buildFile('a.ts', src);
    expect(out).toContain('a.ts:3');
  });

  // ── False positives the regex previously matched ──

  test("does NOT match cat('foo')", async () => {
    const out = await buildFile(
      'a.ts',
      [`declare function cat(s: string): string;`, `export const x = cat('hello');`].join('\n')
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match it('foo')", async () => {
    const out = await buildFile(
      'a.ts',
      [
        `declare function it(name: string, fn?: () => void): void;`,
        `it('foo');`,
        `export {};`,
      ].join('\n')
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match assert('foo')", async () => {
    const out = await buildFile(
      'a.ts',
      [`declare function assert(cond: unknown): void;`, `assert('truthy');`, `export {};`].join(
        '\n'
      )
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match obj.t('foo') (member access)", async () => {
    const out = await buildFile(
      'a.ts',
      [`declare const obj: { t(k: string): string };`, `export const x = obj.t('hello');`].join(
        '\n'
      )
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match obj?.t('foo') (optional chaining)", async () => {
    const out = await buildFile(
      'a.ts',
      [`declare const obj: { t(k: string): string };`, `export const x = obj?.t('hello');`].join(
        '\n'
      )
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match t('foo') inside a string literal", async () => {
    const out = await buildFile('a.ts', `export const x = "snippet: t('hello')";`);
    expect(out).not.toContain('__cs');
  });

  test("does NOT match t('foo') inside a // line comment", async () => {
    const out = await buildFile(
      'a.ts',
      [`// example: t('hello')`, `export const x = 1;`].join('\n')
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match t('foo') inside a /* */ block comment", async () => {
    const out = await buildFile(
      'a.ts',
      [`/* example: t('hello') */`, `export const x = 1;`].join('\n')
    );
    expect(out).not.toContain('__cs');
  });

  test("does NOT match t('foo') inside a template literal", async () => {
    const out = await buildFile('a.ts', `export const x = \`snippet: t('hello')\`;`);
    expect(out).not.toContain('__cs');
  });

  test('DOES match t() inside ${ ... } template interpolation', async () => {
    const out = await buildFile('a.ts', `export const x = \`prefix \${t('hello')}\`;`);
    expect(out).toContain('__cs');
  });

  // ── Two-arg t() with object literal ──

  test('rewrites t("key", { ns: "x" }) by splicing __cs into the object', async () => {
    const out = await buildFile('a.ts', `export const x = t('hello', { ns: 'foo' });`);
    expect(out).toContain('__cs');
    expect(out).toContain('a.ts:1');
    expect(out).toContain('ns');
  });

  test('rewrites t("key", {}) (empty object)', async () => {
    const out = await buildFile('a.ts', `export const x = t('hello', {});`);
    expect(out).toContain('__cs');
  });

  test('does NOT rewrite t("key", varOpts) when 2nd arg is identifier', async () => {
    const out = await buildFile(
      'a.ts',
      [`declare const opts: { ns: string };`, `export const x = t('hello', opts);`].join('\n')
    );
    expect(out).not.toContain('__cs');
  });

  // ── tp() calls ──

  test('rewrites tp("pkg", "key") to append call-site as 4th arg', async () => {
    const out = await buildFile('a.ts', `export const x = tp('weather', 'temperature');`);
    // tp's 4th positional arg is the call-site string itself — no `__cs:` key.
    expect(out).toContain('a.ts:1');
    expect(out).toContain('undefined');
  });

  test('rewrites tp("pkg", "key", "default") to append call-site as 4th arg', async () => {
    const out = await buildFile('a.ts', `export const x = tp('weather', 'temperature', '21°');`);
    expect(out).toContain('a.ts:1');
  });

  test('does NOT rewrite tp(varPkg, "key") when 1st arg is identifier', async () => {
    const out = await buildFile(
      'a.ts',
      [
        `declare const varPkg: string;`,
        `declare function tp(p: string, k: string): string;`,
        `export const x = tp(varPkg, 'temperature');`,
      ].join('\n')
    );
    expect(out).not.toContain('__cs');
    expect(out).not.toContain('a.ts:');
  });

  test('does NOT rewrite tp("pkg", varKey) when 2nd arg is identifier', async () => {
    const out = await buildFile(
      'a.ts',
      [
        `declare const varKey: string;`,
        `declare function tp(p: string, k: string): string;`,
        `export const x = tp('weather', varKey);`,
      ].join('\n')
    );
    expect(out).not.toContain('__cs');
    expect(out).not.toContain('a.ts:');
  });

  test('does NOT touch tp(...) with 4 args already', async () => {
    const out = await buildFile(
      'a.ts',
      `export const x = tp('weather', 'temperature', '21°', 'existing-cs');`
    );
    // The literal 'existing-cs' survives — and no second __cs sneaks in.
    expect(out).toContain('existing-cs');
    expect((out.match(/existing-cs/g) ?? []).length).toBe(1);
  });

  // ── Out-of-tree path rejection ──

  test('does NOT inject when file path escapes sourceRoot', async () => {
    // Place the file in a parent dir, point sourceRoot at a subdir.
    const subdir = join(tmpDir, 'inside');
    await mkdir(subdir, { recursive: true });
    const entryPath = join(tmpDir, 'outside.ts');
    await writeFile(entryPath, `export const x = t('hello');\n`);
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      minify: false,
      plugins: [brikaI18nCallSitePlugin(subdir)],
    });
    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }
    const out = await Bun.file(join(outdir, 'outside.js')).text();
    expect(out).not.toContain('__cs');
  });

  test('does NOT inject for node_modules paths', async () => {
    const pkgDir = join(tmpDir, 'node_modules', 'fake-pkg');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'fake-pkg', main: 'index.js' })
    );
    await writeFile(join(pkgDir, 'index.js'), `export const x = t('hello');\n`);
    const entryPath = join(tmpDir, 'entry.ts');
    await writeFile(entryPath, [`import { x } from 'fake-pkg';`, `export { x };`].join('\n'));
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      minify: false,
      plugins: [brikaI18nCallSitePlugin(tmpDir)],
    });
    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }
    const out = await Bun.file(join(outdir, 'entry.js')).text();
    expect(out).not.toContain('__cs');
  });

  // ── Regex literal edge case ──

  test('does NOT match t(...) commented-out inside a regex character class', async () => {
    // Regex literal with `/t('x')/` shape — the scanner must skip into regex
    // mode after the `=` sign and not look at `t(` inside.
    const out = await buildFile('a.ts', String.raw`export const r = /t\('x'\)/.test('foo');`);
    expect(out).not.toContain('__cs');
  });

  // ── Combined: multiple calls in one file ──

  test('rewrites multiple t() calls in the same file', async () => {
    const src = [`export const a = t('hello');`, `export const b = t('world');`].join('\n');
    const out = await buildFile('a.ts', src);
    expect(out).toContain('a.ts:1');
    expect(out).toContain('a.ts:2');
  });
});
