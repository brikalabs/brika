import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileClientBundle } from './compile-client';

// Temp plugins live INSIDE the compiler package so imports resolve through the
// workspace node_modules (same convention as generate-manifest tests).
const PKG_ROOT = join(import.meta.dir, '..');

describe('compileClientBundle', () => {
  test('maps same-named entrypoints across kinds back to their own sources', async () => {
    // matter ships exactly this shape: bricks/devices.tsx AND pages/devices.tsx.
    // Bun names entry outputs by basename, so a single build cannot tell the two
    // apart; the batch split must keep each mapping unambiguous.
    const root = await mkdtemp(join(PKG_ROOT, 'bundle-'));
    try {
      await mkdir(join(root, 'src', 'bricks'), { recursive: true });
      await mkdir(join(root, 'src', 'pages'), { recursive: true });
      const brick = join(root, 'src', 'bricks', 'devices.tsx');
      const page = join(root, 'src', 'pages', 'devices.tsx');
      await writeFile(brick, 'export default () => "brick-devices";\n');
      await writeFile(page, 'export default () => "page-devices";\n');

      const result = await compileClientBundle({ entrypoints: [brick, page], pluginRoot: root });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.entries.map((e) => e.entrypoint).sort()).toEqual([brick, page].sort());
        const byEntry = new Map(result.entries.map((e) => [e.entrypoint, e.js]));
        expect(byEntry.get(brick)).toContain('brick-devices');
        expect(byEntry.get(page)).toContain('page-devices');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('dedupes identical shared chunks across batches by content-hash name', async () => {
    const root = await mkdtemp(join(PKG_ROOT, 'bundle-'));
    try {
      await mkdir(join(root, 'src', 'bricks'), { recursive: true });
      await mkdir(join(root, 'src', 'pages'), { recursive: true });
      await writeFile(join(root, 'src', 'shared.ts'), 'export const shared = "shared-code";\n');
      const files = {
        brick: join(root, 'src', 'bricks', 'devices.tsx'),
        page: join(root, 'src', 'pages', 'devices.tsx'),
      };
      for (const file of Object.values(files)) {
        await writeFile(
          file,
          `import { shared } from '../shared';\nexport default () => shared;\nexport const lazy = () => import('../shared');\n`
        );
      }

      const result = await compileClientBundle({
        entrypoints: [files.brick, files.page],
        pluginRoot: root,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const names = result.chunks.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
