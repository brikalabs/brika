import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializePrelude, resolvePreludePath } from './prelude-locator';

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

describe('materializePrelude', () => {
  let brikaDir: string;

  beforeEach(async () => {
    brikaDir = await mkdtemp(join(tmpdir(), 'brika-prelude-'));
  });

  afterEach(async () => {
    await rm(brikaDir, { recursive: true, force: true });
  });

  test('writes the source to a content-addressed file under runtime/', async () => {
    const source = 'globalThis.__test_prelude = 1;';
    const path = await materializePrelude(source, brikaDir);
    expect(path).toStartWith(join(brikaDir, 'runtime', 'prelude-'));
    expect(path).toEndWith('.js');
    expect(await Bun.file(path).text()).toBe(source);
  });

  test('written once: a second call reuses the existing file', async () => {
    const source = 'globalThis.__test_prelude = 2;';
    const first = await materializePrelude(source, brikaDir);
    const before = await stat(first);
    const second = await materializePrelude(source, brikaDir);
    expect(second).toBe(first);
    expect((await stat(second)).mtimeMs).toBe(before.mtimeMs);
  });

  test('different sources land in different files', async () => {
    const a = await materializePrelude('a();', brikaDir);
    const b = await materializePrelude('b();', brikaDir);
    expect(a).not.toBe(b);
  });
});
