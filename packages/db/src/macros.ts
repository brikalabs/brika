import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

export function loadMigrations(repoRelativePath: string) {
  return readMigrationFiles({
    migrationsFolder: resolve(REPO_ROOT, repoRelativePath),
  });
}

export async function loadTarBytes(repoRelativePath: string): Promise<number[]> {
  const folderPath = resolve(REPO_ROOT, repoRelativePath);

  // Don't throw when the directory is missing — some callers (e.g. the UI
  // archive embedded into the hub binary) tolerate an empty bundle during
  // development / CI builds that don't run the UI build first. Returning an
  // empty array lets the consumer detect the "nothing to embed" case via
  // `byteLength === 0` and fall through to a different code path.
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    return [];
  }

  const glob = new Bun.Glob('**/*');
  const files: Record<string, Uint8Array> = {};

  for await (const relativePath of glob.scan({
    cwd: folderPath,
    absolute: false,
    dot: true,
  })) {
    const file = Bun.file(resolve(folderPath, relativePath));
    if (await file.exists()) {
      try {
        const content = await file.bytes();
        if (content.length > 0) {
          files[relativePath] = content;
        }
      } catch {
        // skip directories or unreadable files
      }
    }
  }

  if (Object.keys(files).length === 0) {
    return [];
  }

  const archive = new Bun.Archive(files, { compress: 'gzip', level: 9 });
  return Array.from(await archive.bytes());
}
