import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeActionId } from '../action-hash';
import { brikaActionsPlugin } from '../plugins/actions-client';

let pluginRoot: string;

beforeAll(async () => {
  // Use realpath to resolve symlinks (macOS /var -> /private/var) so that
  // paths match what Bun.build passes to plugin hooks.
  pluginRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-actions-test-')));
  await mkdir(join(pluginRoot, 'src', 'features'), { recursive: true });
  await mkdir(join(pluginRoot, 'lib'), { recursive: true });

  // Action file — imports @brika/sdk/actions with one export
  await writeFile(
    join(pluginRoot, 'src', 'actions.ts'),
    `import { defineAction } from '@brika/sdk/actions';\nexport const myAction = defineAction(() => 42);\n`,
  );

  // Action file with multiple exports
  await writeFile(
    join(pluginRoot, 'src', 'multi.ts'),
    [
      `import { defineAction } from '@brika/sdk/actions';`,
      `export const alpha = defineAction(() => 'a');`,
      `export const beta = defineAction(() => 'b');`,
      `export const gamma = defineAction(() => 'c');`,
      '',
    ].join('\n'),
  );

  // Non-action file — no @brika/sdk/actions import
  await writeFile(
    join(pluginRoot, 'src', 'utils.ts'),
    `export function add(a: number, b: number) { return a + b; }\n`,
  );

  // TSX action file (uses .tsx extension but no actual JSX needed for the test)
  await writeFile(
    join(pluginRoot, 'src', 'actions-tsx.tsx'),
    `import { defineAction } from '@brika/sdk/actions';\nexport const tsxAction = defineAction(() => 'tsx');\n`,
  );

  // Index file for directory import resolution
  await writeFile(
    join(pluginRoot, 'src', 'features', 'index.ts'),
    `import { defineAction } from '@brika/sdk/actions';\nexport const featureAction = defineAction(() => 'feat');\n`,
  );

  // File outside src/ — should NOT be intercepted
  await writeFile(
    join(pluginRoot, 'lib', 'external.ts'),
    `import { defineAction } from '@brika/sdk/actions';\nexport const libAction = defineAction(() => 'lib');\n`,
  );
});

afterAll(async () => {
  await rm(pluginRoot, { recursive: true, force: true });
});

async function build(
  entryContent: string,
  entryName = 'entry.ts',
  extra: Partial<Parameters<typeof Bun.build>[0]> = {},
) {
  const entryPath = join(pluginRoot, 'src', entryName);
  await writeFile(entryPath, entryContent);
  const result = await Bun.build({
    entrypoints: [entryPath],
    plugins: [brikaActionsPlugin(pluginRoot)],
    // @brika/sdk/actions is external because it doesn't exist in the test
    // env. For action files the plugin replaces the module body so the bare
    // import is never reached; for non-intercepted files (e.g. outside src/)
    // we still need the bundler to accept it.
    external: ['@brika/sdk/actions'],
    target: 'browser',
    format: 'esm',
    ...extra,
  });
  if (!result.success) {
    throw new AggregateError(result.logs, 'Build failed');
  }
  expect(result.outputs).toHaveLength(1);
  return result.outputs[0].text();
}

describe('brikaActionsPlugin', () => {
  test('replaces action file import with __actionId stub', async () => {
    const code = await build(
      `import { myAction } from './actions';\nexport { myAction };\n`,
    );
    const expectedId = computeActionId('src/actions.ts', 'myAction');
    expect(code).toContain('__actionId');
    expect(code).toContain(expectedId);
    // The original implementation body should NOT appear
    expect(code).not.toContain('defineAction');
  });

  test('non-action file passes through unchanged', async () => {
    const code = await build(
      `import { add } from './utils';\nexport { add };\n`,
    );
    expect(code).not.toContain('__actionId');
    expect(code).toContain('return a + b');
  });

  test('file outside src/ prefix is not intercepted', async () => {
    const code = await build(
      `import { libAction } from '../lib/external';\nexport { libAction };\n`,
      'entry-lib.ts',
    );
    expect(code).not.toContain('__actionId');
    expect(code).toContain('defineAction');
  });

  test('multiple exports each get their own __actionId stub', async () => {
    const code = await build(
      `import { alpha, beta, gamma } from './multi';\nexport { alpha, beta, gamma };\n`,
    );
    const idAlpha = computeActionId('src/multi.ts', 'alpha');
    const idBeta = computeActionId('src/multi.ts', 'beta');
    const idGamma = computeActionId('src/multi.ts', 'gamma');
    expect(code).toContain(idAlpha);
    expect(code).toContain(idBeta);
    expect(code).toContain(idGamma);
    expect(code).not.toContain('defineAction');
  });

  test('action IDs match computeActionId(relativePath, exportName)', async () => {
    const code = await build(
      `import { myAction } from './actions';\nexport { myAction };\n`,
    );
    const expectedId = computeActionId('src/actions.ts', 'myAction');
    expect(code).toContain(`"${expectedId}"`);
  });

  test('.tsx action files work the same as .ts', async () => {
    const code = await build(
      `import { tsxAction } from './actions-tsx';\nexport { tsxAction };\n`,
    );
    const expectedId = computeActionId('src/actions-tsx.tsx', 'tsxAction');
    expect(code).toContain(expectedId);
    expect(code).not.toContain('defineAction');
  });

  describe('import resolution', () => {
    test('specifier with explicit .ts extension', async () => {
      const code = await build(
        `import { myAction } from './actions.ts';\nexport { myAction };\n`,
      );
      expect(code).toContain('__actionId');
      expect(code).toContain(computeActionId('src/actions.ts', 'myAction'));
    });

    test('specifier without extension resolves to .ts', async () => {
      const code = await build(
        `import { myAction } from './actions';\nexport { myAction };\n`,
      );
      expect(code).toContain('__actionId');
      expect(code).toContain(computeActionId('src/actions.ts', 'myAction'));
    });

    test('specifier without extension resolves to .tsx', async () => {
      const code = await build(
        `import { tsxAction } from './actions-tsx';\nexport { tsxAction };\n`,
      );
      expect(code).toContain('__actionId');
      expect(code).toContain(computeActionId('src/actions-tsx.tsx', 'tsxAction'));
    });

    test('directory import resolves to index.ts', async () => {
      const code = await build(
        `import { featureAction } from './features';\nexport { featureAction };\n`,
      );
      const expectedId = computeActionId('src/features/index.ts', 'featureAction');
      expect(code).toContain('__actionId');
      expect(code).toContain(expectedId);
    });

    test('directory import resolves to index.tsx when no index.ts exists', async () => {
      // Create a subdirectory with only index.tsx (no index.ts)
      const subDir = join(pluginRoot, 'src', 'widgets');
      await mkdir(subDir, { recursive: true });
      await writeFile(
        join(subDir, 'index.tsx'),
        "import { defineAction } from '@brika/sdk/actions';\nexport const widgetAction = defineAction(() => 'widget');\n",
      );

      const code = await build(
        "import { widgetAction } from './widgets';\nexport { widgetAction };\n",
      );
      const expectedId = computeActionId('src/widgets/index.tsx', 'widgetAction');
      expect(code).toContain('__actionId');
      expect(code).toContain(expectedId);
    });
  });

  test('cached result: second build reuses detection cache', async () => {
    const plugin = brikaActionsPlugin(pluginRoot);
    const entryPath = join(pluginRoot, 'src', 'entry-cache.ts');
    await writeFile(
      entryPath,
      `import { myAction } from './actions';\nexport { myAction };\n`,
    );

    const opts = {
      entrypoints: [entryPath],
      plugins: [plugin],
      external: ['@brika/sdk/actions'],
      target: 'browser' as const,
      format: 'esm' as const,
    };

    // First build
    const result1 = await Bun.build(opts);
    expect(result1.success).toBe(true);
    const code1 = await result1.outputs[0].text();

    // Second build with the same plugin instance (shared cache)
    const result2 = await Bun.build(opts);
    expect(result2.success).toBe(true);
    const code2 = await result2.outputs[0].text();

    // Both should produce identical output
    expect(code1).toBe(code2);
    expect(code1).toContain('__actionId');
  });
});
