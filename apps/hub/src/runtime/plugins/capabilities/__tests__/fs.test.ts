import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '@brika/capabilities';
import { buildFsCapabilities, isPathAllowed } from '../fs';

describe('isPathAllowed — containment check', () => {
  test('exact root match', () => {
    expect(isPathAllowed('/var/data', ['/var/data'])).toBe(true);
  });

  test('nested child is allowed', () => {
    expect(isPathAllowed('/var/data/sub/file.json', ['/var/data'])).toBe(true);
  });

  test('sibling that shares prefix string is NOT allowed', () => {
    // /var/data2 starts with the literal string '/var/data' but is not
    // inside it — the sep check guards against that footgun.
    expect(isPathAllowed('/var/data2', ['/var/data'])).toBe(false);
  });

  test('parent escape is rejected after canonicalization', () => {
    expect(isPathAllowed('/var/data/../secret', ['/var/data'])).toBe(false);
  });

  test('relative paths are rejected', () => {
    expect(isPathAllowed('data/file', ['/var/data'])).toBe(false);
  });

  test('empty allow list denies everything', () => {
    expect(isPathAllowed('/var/data', [])).toBe(false);
  });
});

describe('fs capability — round-trip in a tmp dir', () => {
  let dir: string;
  let reg: CapabilityRegistry;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'brika-fs-cap-'));
    reg = new CapabilityRegistry();
    for (const cap of buildFsCapabilities({})) {
      reg.register(cap);
    }
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function ctx(allow: string[] = [dir]) {
    return {
      pluginUid: 'p',
      pluginRoot: dir,
      grantedScope: { allow },
      log: () => undefined,
    };
  }

  test('write then read', async () => {
    const file = join(dir, 'a.txt');
    await reg.dispatch('dev.brika.fs.write', { path: file, content: 'hello' }, ctx());
    const out = await reg.dispatch('dev.brika.fs.read', { path: file }, ctx());
    expect(out).toMatchObject({ content: 'hello', encoding: 'utf-8' });
  });

  test('base64 round-trip', async () => {
    const file = join(dir, 'b.bin');
    await reg.dispatch(
      'dev.brika.fs.write',
      { path: file, content: Buffer.from('binary!').toString('base64'), encoding: 'base64' },
      ctx()
    );
    const raw = await readFile(file);
    expect(raw.toString('utf-8')).toBe('binary!');
  });

  test('exists returns true/false', async () => {
    const file = join(dir, 'c.txt');
    expect(await reg.dispatch('dev.brika.fs.exists', { path: file }, ctx())).toEqual({
      exists: false,
    });
    await reg.dispatch('dev.brika.fs.write', { path: file, content: '' }, ctx());
    expect(await reg.dispatch('dev.brika.fs.exists', { path: file }, ctx())).toEqual({
      exists: true,
    });
  });

  test('rejects path outside the allow list', async () => {
    const other = await mkdtemp(join(tmpdir(), 'brika-fs-cap-other-'));
    try {
      await expect(
        reg.dispatch('dev.brika.fs.read', { path: join(other, 'x') }, ctx([dir]))
      ).rejects.toMatchObject({ code: 'FS_PATH_NOT_ALLOWED', data: { op: 'read' } });
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  test('rejects parent-escape via ../', async () => {
    await mkdir(join(dir, 'sub'), { recursive: true });
    await expect(
      reg.dispatch(
        'dev.brika.fs.read',
        { path: join(dir, 'sub', '..', '..', 'etc-passwd') },
        ctx([dir])
      )
    ).rejects.toMatchObject({ code: 'FS_PATH_NOT_ALLOWED', data: { op: 'read' } });
  });

  test('rejects fs.read on a file larger than the 10MB cap', async () => {
    const big = join(dir, 'big.bin');
    await Bun.write(big, Buffer.alloc(12 * 1024 * 1024, 'x'));
    await expect(reg.dispatch('dev.brika.fs.read', { path: big }, ctx())).rejects.toMatchObject({
      code: 'FS_FILE_TOO_LARGE',
      message: expect.stringContaining('cap is'),
      data: { size: 12 * 1024 * 1024, maxBytes: 10 * 1024 * 1024 },
    });
  });

  test('allows fs.read on a small file (cap doesn’t over-reject)', async () => {
    const small = join(dir, 'small.bin');
    await Bun.write(small, Buffer.alloc(1024, 'x'));
    const out = (await reg.dispatch('dev.brika.fs.read', { path: small }, ctx())) as {
      content: string;
    };
    expect(out.content.length).toBe(1024);
  });
});
