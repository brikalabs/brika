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

export async function loadWorkspaceLocaleArchive(): Promise<number[]> {
  const packagesDir = resolve(REPO_ROOT, 'packages');
  if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) {
    return [];
  }

  const files: Record<string, Uint8Array> = {};
  const pkgGlob = new Bun.Glob('*/');

  for await (const dirSlash of pkgGlob.scan({
    cwd: packagesDir,
    absolute: false,
    onlyFiles: false,
  })) {
    const pkgDirName = dirSlash.replace(/\/$/, '');
    if (!pkgDirName) {
      continue;
    }
    await collectPackageLocaleFiles(packagesDir, pkgDirName, files);
  }

  if (Object.keys(files).length === 0) {
    return [];
  }

  const archive = new Bun.Archive(files, { compress: 'gzip', level: 9 });
  return Array.from(await archive.bytes());
}

async function collectPackageLocaleFiles(
  packagesDir: string,
  pkgDirName: string,
  out: Record<string, Uint8Array>
): Promise<void> {
  const pkgRoot = resolve(packagesDir, pkgDirName);
  const localesDir = resolve(pkgRoot, 'locales');
  if (!existsSync(localesDir) || !statSync(localesDir).isDirectory()) {
    return;
  }

  const namespace = await deriveNamespace(pkgRoot, pkgDirName);
  const localeGlob = new Bun.Glob('**/*.json');

  for await (const relPath of localeGlob.scan({ cwd: localesDir, absolute: false })) {
    const file = Bun.file(resolve(localesDir, relPath));
    if (!(await file.exists())) {
      continue;
    }
    try {
      const content = await file.bytes();
      if (content.length > 0) {
        out[`${namespace}/${relPath}`] = content;
      }
    } catch {
      // skip unreadable files
    }
  }
}

async function deriveNamespace(pkgRoot: string, fallback: string): Promise<string> {
  try {
    const parsed: unknown = await Bun.file(resolve(pkgRoot, 'package.json')).json();
    if (parsed !== null && typeof parsed === 'object' && 'name' in parsed) {
      const name = parsed.name;
      if (typeof name === 'string' && name.length > 0) {
        return name.replace(/^@[^/]+\//, '');
      }
    }
  } catch {
    // Fall through to directory-name fallback.
  }
  return fallback;
}
