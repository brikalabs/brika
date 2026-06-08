/**
 * Tests for the stream-write path (`streamWriteFile`) backing the hub's
 * stream-write action. Exercises the security pipeline on real temp dirs:
 * happy-path write, out-of-scope rejection, the per-call size cap (with
 * atomic temp cleanup), Content-Length pre-rejection, and overwrite.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrikaError } from '@brika/errors';
import { QuotaTracker } from '../quotas';
import { DEFAULT_FS_QUOTAS, type FsBackingDirs } from '../types';
import { streamWriteFile } from './write-file';

const WRITE_SCOPE = { read: ['/data/**'], write: ['/data/**'] };

function setupDirs(): { dirs: FsBackingDirs; rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'brika-stream-write-'));
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

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

let roots: string[] = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const r of roots) {
    rmSync(r, { recursive: true, force: true });
  }
});

function freshDeps(maxFileBytes?: number) {
  const { dirs, rootDir } = setupDirs();
  roots.push(rootDir);
  return {
    dirs,
    deps: { dirs, quotas: new QuotaTracker(DEFAULT_FS_QUOTAS), maxFileBytes },
  };
}

describe('streamWriteFile', () => {
  test('streams a body to disk and reports bytesWritten', async () => {
    const { dirs, deps } = freshDeps();
    const payload = new TextEncoder().encode('streamed upload payload');
    const result = await streamWriteFile(deps, {
      scope: WRITE_SCOPE,
      virtualPath: '/data/upload.bin',
      body: streamOf(payload),
    });
    expect(result.bytesWritten).toBe(payload.byteLength);
    expect(readFileSync(join(dirs.data, 'upload.bin'), 'utf8')).toBe('streamed upload payload');
  });

  test('rejects a write outside the granted scope', async () => {
    const { deps } = freshDeps();
    let thrown: BrikaError | undefined;
    try {
      await streamWriteFile(deps, {
        scope: { read: [], write: [] },
        virtualPath: '/data/nope.bin',
        body: streamOf(new TextEncoder().encode('x')),
      });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('enforces the per-call size cap and leaves no partial or temp file', async () => {
    const { dirs, deps } = freshDeps(4);
    let thrown: BrikaError | undefined;
    try {
      await streamWriteFile(deps, {
        scope: WRITE_SCOPE,
        virtualPath: '/data/big.bin',
        body: streamOf(new TextEncoder().encode('way over the cap')),
      });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_FILE_TOO_LARGE');
    expect(existsSync(join(dirs.data, 'big.bin'))).toBe(false);
    // The atomic temp sibling must be cleaned up too.
    expect(readdirSync(dirs.data)).toHaveLength(0);
  });

  test('rejects an oversize Content-Length before streaming', async () => {
    const { dirs, deps } = freshDeps(4);
    let thrown: BrikaError | undefined;
    try {
      await streamWriteFile(deps, {
        scope: WRITE_SCOPE,
        virtualPath: '/data/declared.bin',
        body: streamOf(new TextEncoder().encode('ok')),
        declaredBytes: 999,
      });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_FILE_TOO_LARGE');
    expect(readdirSync(dirs.data)).toHaveLength(0);
  });

  test('overwrites an existing file', async () => {
    const { dirs, deps } = freshDeps();
    writeFileSync(join(dirs.data, 'doc.txt'), 'old contents');
    const next = new TextEncoder().encode('brand new content');
    const result = await streamWriteFile(deps, {
      scope: WRITE_SCOPE,
      virtualPath: '/data/doc.txt',
      body: streamOf(next),
    });
    expect(result.bytesWritten).toBe(next.byteLength);
    expect(readFileSync(join(dirs.data, 'doc.txt'), 'utf8')).toBe('brand new content');
  });
});
