import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeActionId } from '../action-hash';
import { brikaServerActionsPlugin } from '../plugins/actions-server';

describe('brikaServerActionsPlugin', () => {
  let pluginRoot: string;
  let outdir: string;

  beforeEach(async () => {
    // realpath resolves /var -> /private/var on macOS so paths match args.path in Bun plugins
    pluginRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-actions-server-')));
    outdir = join(pluginRoot, 'dist');
    await mkdir(join(pluginRoot, 'src'), { recursive: true });
    await mkdir(outdir, { recursive: true });
  });

  afterEach(async () => {
    await rm(pluginRoot, { recursive: true, force: true });
  });

  async function buildWith(entryContent: string, entryName = 'actions.ts'): Promise<string> {
    const entryPath = join(pluginRoot, 'src', entryName);
    await writeFile(entryPath, entryContent);

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'bun',
      format: 'esm',
      splitting: false,
      external: ['@brika/sdk/actions', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react'],
      plugins: [brikaServerActionsPlugin(pluginRoot)],
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }

    const outFile = join(outdir, entryName.replace(/\.tsx?$/, '.js'));
    return Bun.file(outFile).text();
  }

  // ── 1. File importing @brika/sdk/actions with exports gets finalization ──

  test('appends __finalizeActions with precomputed IDs for file importing @brika/sdk/actions', async () => {
    const output = await buildWith(
      [
        "import { defineAction } from '@brika/sdk/actions';",
        'export const scan = defineAction();',
        'export const play = defineAction();',
      ].join('\n'),
    );

    expect(output).toContain('__finalizeActions');
    // IDs are precomputed at build time, not the module path
    expect(output).toContain(computeActionId('src/actions.ts', 'scan'));
    expect(output).toContain(computeActionId('src/actions.ts', 'play'));
  });

  // ── 2. File NOT importing @brika/sdk/actions passes through ────────

  test('file not importing @brika/sdk/actions has no finalization', async () => {
    const output = await buildWith(
      "export function hello() { return 'world'; }\n",
    );

    expect(output).not.toContain('__finalizeActions');
  });

  // ── 3. File outside src/ prefix passes through ─────────────────────

  test('file outside src/ prefix is not transformed', async () => {
    // Write the entry file outside src/
    const entryPath = join(pluginRoot, 'outside.ts');
    await writeFile(
      entryPath,
      [
        "import { defineAction } from '@brika/sdk/actions';",
        'export const scan = defineAction();',
      ].join('\n'),
    );

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir,
      target: 'bun',
      format: 'esm',
      splitting: false,
      external: ['@brika/sdk/actions', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react'],
      plugins: [brikaServerActionsPlugin(pluginRoot)],
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join(', ')}`);
    }

    const outFile = join(outdir, 'outside.js');
    const output = await Bun.file(outFile).text();

    expect(output).not.toContain('__finalizeActions');
  });

  // ── 4. File with no exports passes through even if it imports actions ──

  test('file with no exports is not transformed even if it imports actions', async () => {
    const output = await buildWith(
      [
        "import { defineAction } from '@brika/sdk/actions';",
        "const internal = defineAction();",
        "console.log(internal);",
      ].join('\n'),
    );

    expect(output).not.toContain('__finalizeActions');
  });

  // ── 5. .tsx files work ─────────────────────────────────────────────

  test('.tsx files with action imports get finalization with precomputed IDs', async () => {
    const output = await buildWith(
      [
        "import { defineAction } from '@brika/sdk/actions';",
        'export const refresh = defineAction();',
        'export function Component() { return <div>hello</div>; }',
      ].join('\n'),
      'actions.tsx',
    );

    expect(output).toContain('__finalizeActions');
    expect(output).toContain(computeActionId('src/actions.tsx', 'refresh'));
  });
});
