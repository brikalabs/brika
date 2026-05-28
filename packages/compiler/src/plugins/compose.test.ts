/**
 * Unit tests for the `composeTransforms` build plugin orchestrator.
 *
 * The motivating bug it solves: when two Bun.build plugins both
 * register an `onLoad({ filter })` for overlapping inputs, only the
 * first plugin to return a non-undefined result wins — the others
 * silently shadow. Composing transforms inside a single `onLoad`
 * sidesteps that race.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeTransforms, type PluginBuildTransform } from './compose';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'brika-compose-'));
}

async function buildOne(entry: string, transforms: PluginBuildTransform[]): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    format: 'esm',
    plugins: [composeTransforms(transforms)],
  });
  if (!result.success) {
    throw new Error(result.logs.map((l) => l.message).join('\n'));
  }
  const output = result.outputs[0];
  if (!output) {
    throw new Error('no output');
  }
  return output.text();
}

describe('composeTransforms', () => {
  test('runs transforms in order — each sees the previous output', async () => {
    const dir = makeTempDir();
    try {
      const entry = join(dir, 'entry.ts');
      writeFileSync(entry, `export const value = 'ALPHA';`);

      const first: PluginBuildTransform = {
        name: 'rename-alpha',
        transform: (content) => content.replace('ALPHA', 'BETA'),
      };
      const second: PluginBuildTransform = {
        name: 'rename-beta',
        transform: (content) => content.replace('BETA', 'GAMMA'),
      };
      const bundle = await buildOne(entry, [first, second]);

      expect(bundle).toContain('GAMMA');
      expect(bundle).not.toContain('BETA');
      expect(bundle).not.toContain('ALPHA');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns the original module unchanged when no transform applies', async () => {
    const dir = makeTempDir();
    try {
      const entry = join(dir, 'entry.ts');
      writeFileSync(entry, `export const untouched = 42;`);

      const passthrough: PluginBuildTransform = {
        name: 'passthrough',
        transform: (content) => content,
      };
      const bundle = await buildOne(entry, [passthrough]);
      expect(bundle).toContain('42');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('threads the context through every transform', async () => {
    const dir = makeTempDir();
    try {
      const entry = join(dir, 'entry.ts');
      writeFileSync(entry, `export const x = 1;`);

      const seenPaths: string[] = [];
      const recorder: PluginBuildTransform = {
        name: 'recorder',
        transform: (content, ctx) => {
          seenPaths.push(ctx.path);
          return content;
        },
      };
      await buildOne(entry, [recorder]);
      expect(seenPaths.length).toBeGreaterThan(0);
      // macOS resolves /var → /private/var, so compare suffix instead
      // of the absolute path.
      expect(seenPaths[0]?.endsWith('entry.ts')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
