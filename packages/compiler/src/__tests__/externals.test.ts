import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaExternalsPlugin } from '../plugins/externals';

describe('brikaExternalsPlugin', () => {
  let tmpDir: string;
  let outdir: string;

  beforeEach(async () => {
    // realpath resolves /var -> /private/var on macOS so paths match in Bun plugins
    tmpDir = await realpath(await mkdtemp(join(tmpdir(), 'brika-externals-')));
    outdir = join(tmpDir, 'dist');
    await mkdir(outdir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function buildEntry(entryContent: string): Promise<string> {
    const entryPath = join(tmpDir, 'entry.ts');
    await writeFile(entryPath, entryContent);

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      splitting: false,
      plugins: [brikaExternalsPlugin()],
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }

    return Bun.file(join(outdir, 'entry.js')).text();
  }

  // ── 1. Known externals are replaced with globalThis.__brika proxies ──

  test('react is replaced with globalThis.__brika.React', async () => {
    const output = await buildEntry(["import React from 'react';", 'export { React };'].join('\n'));

    expect(output).toContain('globalThis.__brika.React');
  });

  test('clsx is replaced with globalThis.__brika.clsx', async () => {
    const output = await buildEntry(
      ["import { clsx } from 'clsx';", 'export { clsx };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.clsx');
  });

  test('lucide-react is replaced with globalThis.__brika.icons', async () => {
    const output = await buildEntry(
      ["import { Sun } from 'lucide-react';", 'export { Sun };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.icons');
  });

  test('class-variance-authority is replaced with globalThis.__brika.cva', async () => {
    const output = await buildEntry(
      ["import { cva } from 'class-variance-authority';", 'export { cva };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.cva');
  });

  test('@brika/sdk/ui-kit is replaced with globalThis.__brika.ui', async () => {
    const output = await buildEntry(
      ["import { Button } from '@brika/sdk/ui-kit';", 'export { Button };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.ui');
  });

  test('@brika/sdk/ui-kit/icons is replaced with globalThis.__brika.icons', async () => {
    const output = await buildEntry(
      ["import { Icon } from '@brika/sdk/ui-kit/icons';", 'export { Icon };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.icons');
  });

  test('@brika/sdk/ui-kit/hooks is replaced with globalThis.__brika.hooks', async () => {
    const output = await buildEntry(
      ["import { useTheme } from '@brika/sdk/ui-kit/hooks';", 'export { useTheme };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.hooks');
  });

  test('@brika/sdk/brick-views is replaced with globalThis.__brika.brickHooks', async () => {
    const output = await buildEntry(
      ["import { useBrick } from '@brika/sdk/brick-views';", 'export { useBrick };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.brickHooks');
  });

  test('react/jsx-runtime is replaced with globalThis.__brika.jsx', async () => {
    const output = await buildEntry(
      ["import { jsx } from 'react/jsx-runtime';", 'export { jsx };'].join('\n')
    );

    expect(output).toContain('globalThis.__brika.jsx');
  });

  // ── 2. Unknown packages pass through normally ──────────────────────

  test('unknown package is not intercepted', async () => {
    const entryPath = join(tmpDir, 'entry.ts');
    await writeFile(
      entryPath,
      ["import { something } from 'lodash';", 'export { something };'].join('\n')
    );

    // Mark lodash as external so Bun.build does not try to resolve it from node_modules
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'browser',
      format: 'esm',
      splitting: false,
      external: ['lodash'],
      plugins: [brikaExternalsPlugin()],
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }

    const output = await Bun.file(join(outdir, 'entry.js')).text();

    // lodash is not in the BRIDGE map, so it should NOT be replaced with globalThis.__brika
    expect(output).not.toContain('globalThis.__brika');
  });

  // ── 3. Relative imports are not intercepted ────────────────────────

  test('relative imports are not intercepted', async () => {
    const helperPath = join(tmpDir, 'helper.ts');
    await writeFile(helperPath, 'export function helper() { return 42; }\n');

    const output = await buildEntry(
      ["import { helper } from './helper';", 'export { helper };'].join('\n')
    );

    expect(output).not.toContain('globalThis.__brika');
    expect(output).toContain('42');
  });

  // ── 4. Each bridge mapping produces correct globalThis path ────────

  test('multiple externals in one file are all replaced correctly', async () => {
    const output = await buildEntry(
      [
        "import React from 'react';",
        "import { clsx } from 'clsx';",
        "import { Sun } from 'lucide-react';",
        'export { React, clsx, Sun };',
      ].join('\n')
    );

    expect(output).toContain('globalThis.__brika.React');
    expect(output).toContain('globalThis.__brika.clsx');
    expect(output).toContain('globalThis.__brika.icons');
  });
});
