import { join } from 'node:path';

let globalDir: string | undefined;

export function configureDatabases(dir: string): void {
  globalDir = dir;
}

export function resolveDatabasePath(path: string): string {
  if (path === ':memory:' || path.startsWith('/')) {
    return path;
  }

  if (!globalDir) {
    throw new Error(
      `Cannot resolve database path "${path}": call configureDatabases() before opening databases.`
    );
  }

  return join(globalDir, 'db', path);
}

/**
 * Test-only helper: clears the module-scoped `globalDir` so a fresh test
 * sees the unconfigured state. Module-singleton config is normal in
 * production (set once at hub startup) but leaks across test files under
 * a single `bun test` runtime. Tests that assert the unconfigured
 * throw-path must call this in `beforeEach`.
 *
 * Not part of the public API; only re-exported under the `./testing`
 * subpath if/when we add one.
 */
export function __resetDatabaseConfig(): void {
  globalDir = undefined;
}
