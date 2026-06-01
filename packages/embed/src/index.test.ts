import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadTarBytes, loadWorkspaceLocaleArchive } from './index';

const REPO_REL = 'packages/embed/.cov-tmp';
const ABS = join(import.meta.dir, '..', '.cov-tmp');

afterAll(() => {
  rmSync(ABS, { recursive: true, force: true });
});

describe('loadTarBytes', () => {
  test('packs a folder into a gzip-compressed tar with content', async () => {
    const bytes = await loadTarBytes('packages/auth/src/migrations');
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });

  test('produces a tar that round-trips back to the original files', async () => {
    const bytes = await loadTarBytes('packages/auth/src/migrations');
    const archive = new Bun.Archive(Bun.gunzipSync(new Uint8Array(bytes)));
    const files = await archive.files();
    expect(files.size).toBeGreaterThan(0);
    expect([...files.keys()].some((p) => p.endsWith('_journal.json'))).toBe(true);
  });

  test('returns an empty array when the folder does not exist', async () => {
    expect(await loadTarBytes('packages/does-not-exist-xyz')).toEqual([]);
  });

  test('returns an empty array when the path is a file (not a directory)', async () => {
    expect(await loadTarBytes('packages/db/package.json')).toEqual([]);
  });

  test('returns an empty array for an existing but empty directory', async () => {
    mkdirSync(join(ABS, 'empty'), { recursive: true });
    expect(await loadTarBytes(`${REPO_REL}/empty`)).toEqual([]);
  });
});

describe('loadWorkspaceLocaleArchive', () => {
  test('packs every package locales/ folder into a gzip-compressed tar', async () => {
    const bytes = await loadWorkspaceLocaleArchive();
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });

  test('archive entries are namespaced by the package name (without scope)', async () => {
    const bytes = await loadWorkspaceLocaleArchive();
    const archive = new Bun.Archive(Bun.gunzipSync(new Uint8Array(bytes)));
    const files = await archive.files();
    const paths = [...files.keys()];
    expect(paths.some((p) => p.startsWith('permissions/en/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('permissions/fr/'))).toBe(true);
  });

  test('only includes JSON locale files', async () => {
    const bytes = await loadWorkspaceLocaleArchive();
    const archive = new Bun.Archive(Bun.gunzipSync(new Uint8Array(bytes)));
    const files = await archive.files();
    for (const path of files.keys()) {
      expect(path.endsWith('.json')).toBe(true);
    }
  });
});
