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

  const archive = new Bun.Archive(files, { compress: 'gzip', level: 9 });
  return Array.from(await archive.bytes());
}
