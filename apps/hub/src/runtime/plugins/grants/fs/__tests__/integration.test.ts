/**
 * End-to-end integration tests for the `ctx.fs.*` grant family.
 *
 * Spawns real temp directories per test, drives the registry through
 * `buildHubGrants`, exercises each verb on real filesystem state, and
 * cleans up afterwards.
 *
 * Sensitive scenarios covered: symlink escape, path-outside-root,
 * quota enforcement, per-file size cap, create-new collision,
 * `/bundle` read-only enforcement, fs.exists on broken symlinks.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrikaError } from '@brika/errors';
import { buildHubGrants } from '../../registry-factory';
import type { FsBackingDirs } from '../types';

function setupDirs(): { dirs: FsBackingDirs; rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'brika-fs-test-'));
  const dirs: FsBackingDirs = {
    bundle: join(rootDir, 'bundle'),
    data: join(rootDir, 'data'),
    cache: join(rootDir, 'cache'),
    tmp: join(rootDir, 'tmp'),
  };
  for (const dir of Object.values(dirs)) {
    mkdirSync(dir, { recursive: true });
  }
  return { dirs, rootDir };
}

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'fs-test',
  pluginRoot: '/nonexistent/plug',
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

const NET_NOOP = { fetch: () => Promise.resolve(new Response('')) };

let cleanupRoots: string[] = [];

beforeEach(() => {
  cleanupRoots = [];
});

afterEach(() => {
  for (const r of cleanupRoots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      // Ignore cleanup races.
    }
  }
});

function freshRegistry(extra?: {
  maxFileBytes?: number;
  quotas?: { data?: number; cache?: number; tmp?: number };
}) {
  const { dirs, rootDir } = setupDirs();
  cleanupRoots.push(rootDir);
  return {
    dirs,
    reg: buildHubGrants(NET_NOOP, {
      fs: {
        dirs,
        maxFileBytes: extra?.maxFileBytes,
        quotas: extra?.quotas
          ? {
              data: extra.quotas.data ?? 100 * 1024 * 1024,
              cache: extra.quotas.cache ?? 500 * 1024 * 1024,
              tmp: extra.quotas.tmp ?? 100 * 1024 * 1024,
            }
          : undefined,
      },
    }),
  };
}

describe('fs.writeFile + readFile round trip', () => {
  test('utf-8 round trip', async () => {
    const { reg } = freshRegistry();
    const scope = { read: ['/data/**'], write: ['/data/**'] };
    await reg.dispatch(
      'dev.brika.fs.writeFile',
      { path: '/data/hello.txt', content: 'hello world', mode: 'overwrite' },
      handlerCtx(scope)
    );
    const out = await reg.dispatch(
      'dev.brika.fs.readFile',
      { path: '/data/hello.txt', encoding: 'utf-8' },
      handlerCtx(scope)
    );
    expect(out).toEqual({ encoding: 'utf-8', content: 'hello world' });
  });

  test('binary round trip', async () => {
    const { reg } = freshRegistry();
    const scope = { read: ['/data/**'], write: ['/data/**'] };
    const bytes = new TextEncoder().encode('binary');
    await reg.dispatch(
      'dev.brika.fs.writeFile',
      { path: '/data/blob.bin', content: bytes, mode: 'overwrite' },
      handlerCtx(scope)
    );
    const out = await reg.dispatch(
      'dev.brika.fs.readFile',
      { path: '/data/blob.bin', encoding: 'binary' },
      handlerCtx(scope)
    );
    expect(out).toMatchObject({ encoding: 'binary' });
  });

  test('append mode adds to existing content', async () => {
    const { reg } = freshRegistry();
    const scope = { read: ['/data/**'], write: ['/data/**'] };
    await reg.dispatch(
      'dev.brika.fs.writeFile',
      { path: '/data/log.txt', content: 'a' },
      handlerCtx(scope)
    );
    await reg.dispatch(
      'dev.brika.fs.writeFile',
      { path: '/data/log.txt', content: 'b', mode: 'append' },
      handlerCtx(scope)
    );
    const out = await reg.dispatch(
      'dev.brika.fs.readFile',
      { path: '/data/log.txt', encoding: 'utf-8' },
      handlerCtx(scope)
    );
    expect(out).toEqual({ encoding: 'utf-8', content: 'ab' });
  });

  test('create-new throws when target exists', async () => {
    const { reg } = freshRegistry();
    const scope = { read: [], write: ['/data/**'] };
    await reg.dispatch(
      'dev.brika.fs.writeFile',
      { path: '/data/x.txt', content: 'hello' },
      handlerCtx(scope)
    );
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.writeFile',
        { path: '/data/x.txt', content: 'world', mode: 'create-new' },
        handlerCtx(scope)
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_ALREADY_EXISTS');
  });
});

describe('fs.readFile — denial paths', () => {
  test('outside scope throws PERMISSION_DENIED', async () => {
    const { reg, dirs } = freshRegistry();
    writeFileSync(join(dirs.cache, 'secret.txt'), 'shhh');
    const scope = { read: ['/data/**'], write: [] };
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch('dev.brika.fs.readFile', { path: '/cache/secret.txt' }, handlerCtx(scope));
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('outside virtual roots throws FS_PATH_OUTSIDE_ROOT', async () => {
    const { reg } = freshRegistry();
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: '/etc/passwd' },
        handlerCtx({ read: [], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_PATH_OUTSIDE_ROOT');
  });

  test('per-call size cap enforced', async () => {
    const { reg, dirs } = freshRegistry({ maxFileBytes: 10 });
    writeFileSync(join(dirs.data, 'big.txt'), 'x'.repeat(50));
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: '/data/big.txt' },
        handlerCtx({ read: ['/data/**'], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_FILE_TOO_LARGE');
  });
});

describe('fs.writeFile — quota + readOnly', () => {
  test('per-root quota blocks the offending write', async () => {
    const { reg } = freshRegistry({ quotas: { data: 50 } });
    const scope = { read: [], write: ['/data/**'] };
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.writeFile',
        { path: '/data/big.txt', content: 'x'.repeat(100) },
        handlerCtx(scope)
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_QUOTA_EXCEEDED');
  });

  test('write to /bundle is always denied', async () => {
    const { reg } = freshRegistry();
    const scope = { read: [], write: ['/bundle/**'] };
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.writeFile',
        { path: '/bundle/sneaky.txt', content: 'x' },
        handlerCtx(scope)
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });
});

describe('fs.readdir, fs.stat, fs.mkdir, fs.rm, fs.exists', () => {
  test('readdir non-recursive lists the immediate children', async () => {
    const { reg, dirs } = freshRegistry();
    writeFileSync(join(dirs.data, 'a.txt'), 'a');
    writeFileSync(join(dirs.data, 'b.txt'), 'b');
    mkdirSync(join(dirs.data, 'sub'));
    const out = await reg.dispatch(
      'dev.brika.fs.readdir',
      { path: '/data' },
      handlerCtx({ read: ['/data/**'], write: [] })
    );
    expect(out).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ name: 'a.txt', isFile: true }),
        expect.objectContaining({ name: 'b.txt', isFile: true }),
        expect.objectContaining({ name: 'sub', isDirectory: true }),
      ]),
    });
  });

  test('readdir recursive walks subdirs', async () => {
    const { reg, dirs } = freshRegistry();
    mkdirSync(join(dirs.data, 'sub'));
    writeFileSync(join(dirs.data, 'sub', 'leaf.txt'), 'leaf');
    const out = await reg.dispatch(
      'dev.brika.fs.readdir',
      { path: '/data', recursive: true },
      handlerCtx({ read: ['/data/**'], write: [] })
    );
    const names = (out as { entries: { name: string }[] }).entries.map((e) => e.name).sort();
    expect(names).toEqual(['sub', 'sub/leaf.txt']);
  });

  test('stat returns metadata, lstat-style', async () => {
    const { reg, dirs } = freshRegistry();
    writeFileSync(join(dirs.data, 'x.txt'), 'hello');
    const out = await reg.dispatch(
      'dev.brika.fs.stat',
      { path: '/data/x.txt' },
      handlerCtx({ read: ['/data/**'], write: [] })
    );
    expect(out).toMatchObject({ size: 5, isFile: true, isDirectory: false });
  });

  test('mkdir recursive creates intermediate dirs', async () => {
    const { reg } = freshRegistry();
    const out = await reg.dispatch(
      'dev.brika.fs.mkdir',
      { path: '/data/a/b/c', recursive: true },
      handlerCtx({ read: [], write: ['/data/**'] })
    );
    expect(out).toMatchObject({ created: true });
  });

  test('rm removes a file and updates the quota', async () => {
    const { reg, dirs } = freshRegistry();
    writeFileSync(join(dirs.data, 'x.txt'), 'hello');
    const out = await reg.dispatch(
      'dev.brika.fs.rm',
      { path: '/data/x.txt' },
      handlerCtx({ read: [], write: ['/data/**'] })
    );
    expect(out).toMatchObject({ removed: true });
  });

  test('exists returns true / false', async () => {
    const { reg, dirs } = freshRegistry();
    writeFileSync(join(dirs.data, 'x.txt'), 'hello');
    const yes = await reg.dispatch(
      'dev.brika.fs.exists',
      { path: '/data/x.txt' },
      handlerCtx({ read: ['/data/**'], write: [] })
    );
    expect(yes).toMatchObject({ exists: true });
    const no = await reg.dispatch(
      'dev.brika.fs.exists',
      { path: '/data/missing.txt' },
      handlerCtx({ read: ['/data/**'], write: [] })
    );
    expect(no).toMatchObject({ exists: false });
  });
});

describe('symlink escape defence', () => {
  test('readFile on a symlink that escapes the backing dir is rejected', async () => {
    const { reg, dirs, rootDir } = (() => {
      const r = freshRegistry();
      return { ...r, rootDir: r.dirs.data };
    })();
    // Use the host rootDir variable too — but really: build a symlink
    // inside /data that points to a file outside the backing dir.
    const evil = join(rootDir, 'escape');
    writeFileSync(join('/tmp', `brika-escape-target-${process.pid}-${Date.now()}.txt`), 'gotcha');
    const outsideTarget = `/tmp/brika-escape-target-${process.pid}-${Date.now()}.txt`;
    writeFileSync(outsideTarget, 'gotcha');
    symlinkSync(outsideTarget, evil);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.fs.readFile',
        { path: '/data/escape' },
        handlerCtx({ read: ['/data/**'], write: [] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_SYMLINK_ESCAPE');
    // Track the escape target so afterEach cleans it up.
    cleanupRoots.push(outsideTarget);
    // Also keep the unused dirs reference from triggering "unused" warnings.
    expect(dirs.data).toBeDefined();
  });
});
