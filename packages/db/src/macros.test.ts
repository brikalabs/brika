import { describe, expect, test } from 'bun:test';
import { loadMigrations, loadTarBytes, loadWorkspaceLocaleArchive } from './macros';

describe('loadMigrations', () => {
  test('returns drizzle MigrationMeta[] for an existing migrations folder', () => {
    const migrations = loadMigrations('packages/auth/src/migrations');
    expect(migrations.length).toBeGreaterThan(0);
    const first = migrations[0];
    expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(first?.sql)).toBe(true);
    expect(first?.sql.length).toBeGreaterThan(0);
    expect(typeof first?.folderMillis).toBe('number');
  });

  test('returns sorted migrations (folderMillis ascending)', () => {
    const migrations = loadMigrations('apps/hub/src/runtime/state/migrations');
    if (migrations.length < 2) {
      return;
    }
    for (let i = 1; i < migrations.length; i++) {
      const prev = migrations[i - 1];
      const curr = migrations[i];
      expect(curr?.folderMillis).toBeGreaterThanOrEqual(prev?.folderMillis ?? 0);
    }
  });
});

describe('loadTarBytes', () => {
  test('packs a folder into a gzip-compressed tar with content', async () => {
    const bytes = await loadTarBytes('packages/auth/src/migrations');
    expect(bytes.length).toBeGreaterThan(0);
    // gzip magic bytes
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

  test('produces output of reasonable size for a known folder', async () => {
    const bytes = await loadTarBytes('packages/auth/src/migrations');
    // sanity: at least a tar header, plus the small SQL/journal files compressed.
    expect(bytes.length).toBeGreaterThan(64);
    expect(bytes.length).toBeLessThan(50_000);
  });

  test('returns an empty array when the folder does not exist', async () => {
    expect(await loadTarBytes('packages/does-not-exist-xyz')).toEqual([]);
  });

  test('returns an empty array when the path is a file (not a directory)', async () => {
    expect(await loadTarBytes('packages/db/package.json')).toEqual([]);
  });
});

describe('loadWorkspaceLocaleArchive', () => {
  test('packs every package locales/ folder into a gzip-compressed tar', async () => {
    const bytes = await loadWorkspaceLocaleArchive();
    expect(bytes.length).toBeGreaterThan(0);
    // gzip magic bytes
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });

  test('archive entries are namespaced by the package name (without scope)', async () => {
    const bytes = await loadWorkspaceLocaleArchive();
    const archive = new Bun.Archive(Bun.gunzipSync(new Uint8Array(bytes)));
    const files = await archive.files();
    const paths = [...files.keys()];

    // permissions package has en/permissions.json and fr/permissions.json,
    // packaged under its derived namespace `permissions`.
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
