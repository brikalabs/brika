import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { resolvePreludePath } from './prelude-locator';

describe('resolvePreludePath', () => {
  test('dev (source on disk): returns the prelude source path, no materialization', async () => {
    const path = await resolvePreludePath('/tmp/never-used');
    expect(path).toBe(join(import.meta.dir, 'prelude', 'index.ts'));
    expect(await Bun.file(path).exists()).toBe(true);
  });

  test('memoized: same promise result on repeat calls', async () => {
    const first = await resolvePreludePath('/tmp/never-used');
    const second = await resolvePreludePath('/tmp/other-dir');
    expect(second).toBe(first);
  });
});
