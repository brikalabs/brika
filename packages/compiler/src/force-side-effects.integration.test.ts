import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaForceSideEffectsPlugin } from './plugins/force-side-effects';

describe('brikaForceSideEffectsPlugin', () => {
  let tmpDir: string;
  let outdir: string;

  beforeEach(async () => {
    tmpDir = await realpath(await mkdtemp(join(tmpdir(), 'brika-force-side-effects-')));
    outdir = join(tmpDir, 'dist');
    await mkdir(outdir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Reproduces the recharts-style failure: a barrel `index.js` re-exporting
   * a function from a sibling, with `sideEffects: false` set on the package.
   * Without the plugin, Bun's barrel optimizer drops the implementation and
   * the call site references an undefined identifier.
   */
  async function buildBarrelScenario(plugins: Parameters<typeof Bun.build>[0]['plugins']) {
    const pkgDir = join(tmpDir, 'node_modules', 'barrel-pkg');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'barrel-pkg',
        main: 'index.js',
        sideEffects: false,
      })
    );
    // Barrel file: only re-exports
    await writeFile(join(pkgDir, 'index.js'), `export { computeAnswer } from './impl';\n`);
    // Implementation
    await writeFile(join(pkgDir, 'impl.js'), `export const computeAnswer = () => 42;\n`);

    const entryPath = join(tmpDir, 'entry.js');
    await writeFile(
      entryPath,
      [
        "import { computeAnswer } from 'barrel-pkg';",
        'export const result = computeAnswer();',
      ].join('\n')
    );

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      splitting: false,
      plugins,
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }

    return Bun.file(join(outdir, 'entry.js')).text();
  }

  test('keeps the implementation reachable across a barrel re-export', async () => {
    const output = await buildBarrelScenario([brikaForceSideEffectsPlugin()]);

    expect(output).toContain('computeAnswer');
    expect(output).toContain('42');
  });

  test('does not touch files outside node_modules', async () => {
    const helperPath = join(tmpDir, 'helper.ts');
    await writeFile(
      helperPath,
      ['export const a = 1;', 'export const b = 2;', "export { a as x } from './helper';"].join(
        '\n'
      )
    );
    const entryPath = join(tmpDir, 'entry-no-nm.ts');
    await writeFile(entryPath, "import { a } from './helper'; export const r = a;");

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      splitting: false,
      plugins: [brikaForceSideEffectsPlugin()],
    });

    expect(result.success).toBe(true);
    const output = await Bun.file(join(outdir, 'entry-no-nm.js')).text();
    // First-party file was not rewritten by the plugin
    expect(output).not.toContain('__re_');
  });
});
