import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gcPluginStorage } from './storage-gc';

const DAY = 24 * 60 * 60 * 1000;

describe('gcPluginStorage', () => {
  let systemDir: string;
  let uidBase: string;

  beforeEach(() => {
    systemDir = mkdtempSync(join(tmpdir(), 'brika-gc-'));
    uidBase = join(systemDir, 'plugins', 'data', 'plugin-uid');
    for (const root of ['data', 'cache', 'tmp']) {
      mkdirSync(join(uidBase, root), { recursive: true });
      writeFileSync(join(uidBase, root, 'file.bin'), 'x'.repeat(100));
    }
  });

  afterEach(() => {
    rmSync(systemDir, { recursive: true, force: true });
  });

  test('removes aged cache/tmp files but never touches /data', async () => {
    // A `now` far in the future makes every file older than its max age.
    const result = await gcPluginStorage(systemDir, Date.now() + 100 * DAY);

    expect(existsSync(join(uidBase, 'tmp', 'file.bin'))).toBe(false);
    expect(existsSync(join(uidBase, 'cache', 'file.bin'))).toBe(false);
    // Persistent storage is sacred — GC must never delete from /data.
    expect(existsSync(join(uidBase, 'data', 'file.bin'))).toBe(true);

    expect(result.removedFiles).toBe(2);
    expect(result.freedBytes).toBe(200);
    expect(result.sweptPlugins).toBe(1);
  });

  test('keeps fresh files within their max age', async () => {
    const result = await gcPluginStorage(systemDir, Date.now());

    expect(existsSync(join(uidBase, 'tmp', 'file.bin'))).toBe(true);
    expect(existsSync(join(uidBase, 'cache', 'file.bin'))).toBe(true);
    expect(result.removedFiles).toBe(0);
  });

  test('is a no-op when there is no plugin-data dir', async () => {
    rmSync(join(systemDir, 'plugins'), { recursive: true, force: true });
    const result = await gcPluginStorage(systemDir, Date.now() + 100 * DAY);
    expect(result).toEqual({ freedBytes: 0, removedFiles: 0, sweptPlugins: 0 });
  });

  test('removes subdirectories it empties, but keeps the tmp/cache roots', async () => {
    const nested = join(uidBase, 'tmp', 'job-1', 'inputs');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'photo.jpg'), 'x'.repeat(50));

    await gcPluginStorage(systemDir, Date.now() + 100 * DAY);

    // The emptied scratch hierarchy is gone…
    expect(existsSync(join(uidBase, 'tmp', 'job-1'))).toBe(false);
    // …but the tmp/ root itself remains (re-created lazily on next plugin use).
    expect(existsSync(join(uidBase, 'tmp'))).toBe(true);
  });

  test('respects custom per-root ages (tmp aged out, cache kept)', async () => {
    // tmp max age tiny (everything stale), cache max age huge (nothing stale).
    const result = await gcPluginStorage(systemDir, Date.now() + DAY, {
      tmpMaxAgeMs: 1,
      cacheMaxAgeMs: 10 * 365 * DAY,
    });
    expect(existsSync(join(uidBase, 'tmp', 'file.bin'))).toBe(false);
    expect(existsSync(join(uidBase, 'cache', 'file.bin'))).toBe(true);
    expect(result.removedFiles).toBe(1);
  });
});
