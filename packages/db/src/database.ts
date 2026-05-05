import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolveDatabasePath } from './config';

export type BrikaDatabase<TSchema extends Record<string, unknown>> = ReturnType<
  typeof openDatabase<TSchema>
>;

export interface DatabaseDefinition<TSchema extends Record<string, unknown>> {
  open(path?: string): BrikaDatabase<TSchema>;
}

export function defineDatabase<TSchema extends Record<string, unknown>>(
  name: string,
  schema: TSchema,
  migrationsTar: Uint8Array
): DatabaseDefinition<TSchema> {
  return {
    open: (path?: string) => openDatabase(path ?? name, schema, migrationsTar),
  };
}

function openDatabase<TSchema extends Record<string, unknown>>(
  path: string,
  schema: TSchema,
  migrationsTar: Uint8Array
) {
  const resolved = resolveDatabasePath(path);
  if (resolved !== ':memory:') {
    mkdirSync(dirname(resolved), { recursive: true });
  }
  const sqlite = new Database(resolved, { create: true });
  sqlite.query('PRAGMA journal_mode = WAL').run();
  sqlite.query('PRAGMA synchronous = NORMAL').run();
  sqlite.query('PRAGMA temp_store = MEMORY').run();
  sqlite.query('PRAGMA mmap_size = 268435456').run();
  sqlite.query('PRAGMA foreign_keys = ON').run();

  const db = drizzle(sqlite, { schema });

  const migrationsDir = mkdtempSync(join(tmpdir(), 'brika-migrations-'));
  try {
    extractTarSync(Bun.gunzipSync(migrationsTar), migrationsDir);
    migrate(db, { migrationsFolder: migrationsDir });
  } finally {
    rmSync(migrationsDir, { recursive: true, force: true });
  }

  return { db, sqlite, path: resolved };
}

/**
 * Synchronous POSIX ustar tar extractor.
 * Parses the raw (uncompressed) tar data and writes files to targetDir.
 */
function extractTarSync(tar: Uint8Array, targetDir: string): void {
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);

    // Two consecutive zero-filled 512-byte blocks signal end-of-archive
    if (header.every(b => b === 0)) break;

    const name = readNullTerminated(decoder, header, 0, 100);
    if (!name) break;

    const sizeStr = readNullTerminated(decoder, header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = header[156];

    offset += 512;

    // typeFlag 0x30 ('0') = regular file, 0 = old-style regular file
    if ((typeFlag === 0x30 || typeFlag === 0) && size > 0) {
      const content = tar.subarray(offset, offset + size);
      const filePath = join(targetDir, name);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }

    offset += Math.ceil(size / 512) * 512;
  }
}

function readNullTerminated(decoder: TextDecoder, data: Uint8Array, start: number, length: number): string {
  const slice = data.subarray(start, start + length);
  const nullIdx = slice.indexOf(0);
  return decoder.decode(nullIdx >= 0 ? slice.subarray(0, nullIdx) : slice);
}
