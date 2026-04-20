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
