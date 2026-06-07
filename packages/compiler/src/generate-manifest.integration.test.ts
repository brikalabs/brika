import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateEntry, generateManifest } from './generate-manifest';

// Temp plugins live INSIDE the compiler package so the block/spark modules
// we import can resolve `@brika/sdk` through the workspace node_modules.
const PKG_ROOT = join(import.meta.dir, '..');

const VIEW_STUB = 'export default function V() { return null; }\n';

function blockSrc(id: string, withMeta: boolean): string {
  const meta = withMeta
    ? `meta: { name: '${id}', description: 'd', category: 'action', icon: 'zap', color: '#112233' }, `
    : '';
  return `import { defineReactiveBlock, input, output, z } from '@brika/sdk';
export default defineReactiveBlock(
  { id: '${id}', ${meta}inputs: { trigger: input(z.generic(), { name: 'Trigger' }) }, outputs: { out: output(z.object({ value: z.number() }), { name: 'Out' }) }, config: z.object({}) },
  () => {}
);
`;
}

const SPARK_SRC = `import { z } from '@brika/sdk';
import { defineSpark } from '@brika/sdk/sparks';
export const a = defineSpark({ id: 'spark-a', meta: { name: 'Spark A', description: 'desc' }, schema: z.object({ n: z.number() }) });
export const b = defineSpark({ id: 'spark-b', schema: z.object({ n: z.number() }) });
`;

describe('generateManifest', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(PKG_ROOT, 'genman-'));
    await mkdir(join(root, 'src', 'blocks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('lowers block + spark meta into manifest arrays sorted by id', async () => {
    await writeFile(join(root, 'src', 'blocks', 'alpha.ts'), blockSrc('alpha', true));
    await writeFile(join(root, 'src', 'blocks', 'alpha.view.tsx'), VIEW_STUB);
    await writeFile(join(root, 'src', 'blocks', 'beta.ts'), blockSrc('beta', true));
    await writeFile(join(root, 'src', 'sparks.ts'), SPARK_SRC);

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    // `view: true` is derived from the presence of alpha.view.tsx; beta has none.
    expect(result.blocks).toEqual([
      {
        id: 'alpha',
        name: 'alpha',
        description: 'd',
        category: 'action',
        icon: 'zap',
        color: '#112233',
        view: true,
      },
      {
        id: 'beta',
        name: 'beta',
        description: 'd',
        category: 'action',
        icon: 'zap',
        color: '#112233',
      },
    ]);
    expect(result.sparks).toEqual([
      { id: 'spark-a', name: 'Spark A', description: 'desc' },
      { id: 'spark-b' },
    ]);
  });

  test('block without meta produces an error diagnostic and is dropped', async () => {
    await writeFile(join(root, 'src', 'blocks', 'gamma.ts'), blockSrc('gamma', false));

    const result = await generateManifest(root);

    expect(result.ok).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(
      result.diagnostics.some(
        (d) => d.level === 'error' && d.message.includes('gamma') && d.message.includes('meta')
      )
    ).toBe(true);
  });

  test('ignores _ prefixed helper files', async () => {
    await writeFile(join(root, 'src', 'blocks', 'alpha.ts'), blockSrc('alpha', true));
    await writeFile(join(root, 'src', 'blocks', '_helper.ts'), 'export const x = 1;\n');

    const result = await generateManifest(root);

    expect(result.blocks.map((b) => b.id)).toEqual(['alpha']);
  });

  test('extracts brick meta + config (react/icons stubbed) into bricks[]', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    const brick = `import { z } from '@brika/sdk';
import { Gauge } from 'lucide-react';
export const meta = { name: 'Gauge', description: 'A gauge', category: 'monitoring', icon: 'gauge', color: '#abcdef' };
export const config = z.object({
  unit: z.enum(['c', 'f']).default('c').meta({ label: 'Unit' }),
  refresh: z.number().min(1).max(10).default(5).describe('Refresh'),
});
export default function GaugeBrick() {
  return <div><Gauge /></div>;
}
`;
    await writeFile(join(root, 'src', 'bricks', 'gauge.tsx'), brick);

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.bricks).toEqual([
      {
        id: 'gauge',
        name: 'Gauge',
        description: 'A gauge',
        category: 'monitoring',
        icon: 'gauge',
        color: '#abcdef',
        config: [
          {
            type: 'dropdown',
            name: 'unit',
            label: 'Unit',
            default: 'c',
            options: [{ value: 'c' }, { value: 'f' }],
          },
          { type: 'number', name: 'refresh', description: 'Refresh', default: 5, min: 1, max: 10 },
        ],
      },
    ]);
  });

  test('a brick without a meta export is an error', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(
      join(root, 'src', 'bricks', 'nometa.tsx'),
      'export default function NoMeta() {\n  return null;\n}\n'
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(false);
    expect(result.bricks).toEqual([]);
    expect(
      result.diagnostics.some(
        (d) => d.level === 'error' && d.message.includes('nometa') && d.message.includes('meta')
      )
    ).toBe(true);
  });

  test('generateEntry imports server modules + lifecycle, skipping tests and helpers', async () => {
    await writeFile(join(root, 'src', 'blocks', 'alpha.ts'), blockSrc('alpha', true));
    await writeFile(join(root, 'src', 'blocks', '_helper.ts'), 'export const x = 1;\n');
    await writeFile(join(root, 'src', 'blocks', 'alpha.test.ts'), 'export const t = 1;\n');
    await writeFile(join(root, 'src', 'sparks.ts'), SPARK_SRC);
    await writeFile(join(root, 'src', 'actions.ts'), 'export const noop = () => undefined;\n');
    await writeFile(join(root, 'src', 'plugin.ts'), 'export const lifecycle = true;\n');

    const entry = await generateEntry(root);

    expect(entry).toContain("import '../blocks/alpha';");
    expect(entry).toContain("import '../sparks';");
    expect(entry).toContain("import '../actions';");
    expect(entry).toContain("import '../plugin';"); // lifecycle last
    expect(entry).not.toContain('_helper');
    expect(entry).not.toContain('alpha.test');
    expect(entry.trim().endsWith("import '../plugin';")).toBe(true);
  });

  test('pages get id from filename + icon from meta (ui-kit stubbed)', async () => {
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    // Imports @brika/sdk/ui-kit to exercise the ui-kit stub path.
    await writeFile(
      join(root, 'src', 'pages', 'devices.tsx'),
      "import { Card } from '@brika/sdk/ui-kit';\nexport const meta = { icon: 'cpu' };\nexport default function DevicesPage() {\n  return <Card>x</Card>;\n}\n"
    );
    // A page with no meta export is valid; it contributes just its id.
    await writeFile(
      join(root, 'src', 'pages', 'plain.tsx'),
      'export default function PlainPage() {\n  return null;\n}\n'
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.pages).toEqual([{ id: 'devices', icon: 'cpu' }, { id: 'plain' }]);
  });
});
