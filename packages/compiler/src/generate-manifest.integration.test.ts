import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computeActionId } from './bundle/action-scan';
import { generateEntry } from './generate-entry';
import { generateManifest } from './generate-manifest';

// Temp plugins live INSIDE the compiler package so the block/spark modules
// we import can resolve `@brika/sdk` through the workspace node_modules.
const PKG_ROOT = join(import.meta.dir, '..');

const VIEW_STUB = 'export default function V() { return null; }\n';

function blockSrc(id: string, withMeta: boolean): string {
  const meta = withMeta
    ? `meta: { name: '${id}', description: 'd', category: 'action', icon: 'zap', color: '#112233' }, `
    : '';
  return `import { defineBlock, input, output, z } from '@brika/sdk';
export default defineBlock({
  id: '${id}', ${meta}inputs: { trigger: input(z.generic()) }, outputs: { out: output(z.object({ value: z.number() })) }, config: z.object({}),
  run() {},
});
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

  test('defineBrick descriptor lowers config; legacy .tsx still works alongside', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    // New model: a react-free descriptor + a view file at <id>.tsx.
    await writeFile(
      join(root, 'src', 'bricks', 'dial.brick.ts'),
      [
        "import { defineBrick } from '@brika/sdk/brick';",
        "import { z } from '@brika/sdk';",
        'export const dial = defineBrick({',
        "  id: 'dial',",
        "  meta: { name: 'Dial', category: 'monitoring', icon: 'gauge' },",
        "  config: z.object({ max: z.number().min(0).max(100).default(60).meta({ label: 'Max' }) }),",
        '  data: z.object({ value: z.number() }),',
        '});',
      ].join('\n')
    );
    await writeFile(
      join(root, 'src', 'bricks', 'dial.tsx'),
      "import { dial } from './dial.brick';\nexport default function Dial() { return null; }\n"
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.bricks).toEqual([
      {
        id: 'dial',
        name: 'Dial',
        category: 'monitoring',
        icon: 'gauge',
        config: [{ type: 'number', name: 'max', label: 'Max', default: 60, min: 0, max: 100 }],
      },
    ]);
  });

  test('single-file brick: defineBrick + default view in one .tsx', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    // Config-only brick: the descriptor lives beside the view, no .brick.ts.
    await writeFile(
      join(root, 'src', 'bricks', 'clock.tsx'),
      [
        "import { z } from '@brika/sdk';",
        "import { defineBrick } from '@brika/sdk/brick';",
        'export const clock = defineBrick({',
        "  id: 'clock',",
        "  meta: { name: 'Clock', category: 'time', icon: 'clock' },",
        "  config: z.object({ tz: z.string().default('UTC').meta({ label: 'Timezone' }) }),",
        '  data: z.object({}),',
        '});',
        'export default function Clock() { return null; }',
      ].join('\n')
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.bricks).toEqual([
      {
        id: 'clock',
        name: 'Clock',
        category: 'time',
        icon: 'clock',
        config: [{ type: 'text', name: 'tz', label: 'Timezone', default: 'UTC' }],
      },
    ]);
  });

  test('single-file brick whose descriptor id mismatches the filename is an error', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(
      join(root, 'src', 'bricks', 'wrong-name.tsx'),
      [
        "import { z } from '@brika/sdk';",
        "import { defineBrick } from '@brika/sdk/brick';",
        "export const x = defineBrick({ id: 'clock', meta: { name: 'Clock' }, config: z.object({}), data: z.object({}) });",
        'export default function X() { return null; }',
      ].join('\n')
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.level === 'error' && d.message.includes('clock') && d.message.includes('rename')
      )
    ).toBe(true);
  });

  test('collects a block whose module reaches getContext() at import time', async () => {
    // Mirrors defineOAuth: an SDK call at module top level. The build-time
    // context stub makes it a no-op instead of throwing "SDK only works...".
    await writeFile(
      join(root, 'src', 'blocks', 'ctxy.ts'),
      [
        "import { defineBlock, getPreferences, input, z } from '@brika/sdk';",
        'getPreferences();',
        "export default defineBlock({ id: 'ctxy', meta: { name: 'Ctxy', category: 'action' }, inputs: { trigger: input(z.generic()) }, config: z.object({}), run() {} });",
      ].join('\n')
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.blocks.map((b) => b.id)).toContain('ctxy');
  });

  test('reads a brick view whose import graph reaches a node: builtin', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    // A server-only import (node:sqlite) leaks into the view's graph; the view
    // never runs in the build, so the bundler stubs it instead of failing.
    await writeFile(
      join(root, 'src', 'bricks', 'db.tsx'),
      [
        "import 'node:sqlite';",
        "export const meta = { name: 'Db', category: 'monitoring', icon: 'database' };",
        'export default function Db() { return null; }',
      ].join('\n')
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.bricks.map((b) => b.id)).toContain('db');
  });

  test('a descriptor without a matching view file is an error', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(
      join(root, 'src', 'bricks', 'orphan.brick.ts'),
      [
        "import { defineBrick } from '@brika/sdk/brick';",
        "import { z } from '@brika/sdk';",
        "export const orphan = defineBrick({ id: 'orphan', meta: { name: 'Orphan' }, config: z.object({}), data: z.object({}) });",
      ].join('\n')
    );

    const result = await generateManifest(root);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.level === 'error' && d.message.includes('orphan') && d.message.includes('view')
      )
    ).toBe(true);
  });

  test('scans server actions into actions[] with server-build-parity ids', async () => {
    const ACTIONS_SRC = [
      "import { defineAction } from '@brika/sdk/actions';",
      'export const scan = defineAction(async () => {});',
      'export default defineAction(async () => {});',
    ].join('\n');
    await writeFile(join(root, 'src', 'actions.ts'), ACTIONS_SRC);
    // Actions register from wherever the server graph imports them, so the
    // scan covers all of src/, not just the conventional actions dir.
    await mkdir(join(root, 'src', 'pages', 'files'), { recursive: true });
    await writeFile(
      join(root, 'src', 'pages', 'files', 'actions.ts'),
      "import { defineAction } from '@brika/sdk/actions';\nexport const list = defineAction(async () => {});\n"
    );
    // Test files never reach the entry graph; they must not be listed.
    await writeFile(join(root, 'src', 'actions.test.ts'), ACTIONS_SRC);
    // A file without a value-import of @brika/sdk/actions is not an action file.
    await writeFile(join(root, 'src', 'util.ts'), 'export const x = 1;\n');

    const result = await generateManifest(root);

    expect(result.ok).toBe(true);
    expect(result.actions.map((a) => `${a.file}#${a.name}`).sort()).toEqual([
      'src/actions.ts#default',
      'src/actions.ts#scan',
      'src/pages/files/actions.ts#list',
    ]);
    // Each id is exactly what actions-server injects at compile time.
    for (const a of result.actions) {
      expect(a.id).toBe(await computeActionId(a.file, a.name));
    }
    // Deterministic output: sorted by id like every other manifest array.
    expect(result.actions.map((a) => a.id)).toEqual(
      [...result.actions.map((a) => a.id)].sort((x, y) => x.localeCompare(y))
    );
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
