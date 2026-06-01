/**
 * Lazy `bun:sqlite` loader.
 *
 * `bun:sqlite` only exists inside the Bun runtime. Importing it at the
 * top level of any module in the `@brika/db` barrel means that *loading
 * the barrel under plain Node* — which is exactly what `drizzle-kit
 * generate/studio` does when it imports a `schema.ts` that re-exports
 * through `@brika/db` — throws `Cannot find module 'bun:sqlite'` before
 * a single statement runs.
 *
 * Loading it lazily (only when a database is actually opened, which only
 * ever happens under Bun) keeps the module graph importable by Node
 * tooling while costing nothing at runtime: Bun caches the builtin after
 * the first `require`.
 */

import type { Database } from 'bun:sqlite';
import type { drizzle as drizzleBunSqlite } from 'drizzle-orm/bun-sqlite';

type DatabaseConstructor = typeof Database;
type DrizzleFn = typeof drizzleBunSqlite;

// Bun's synchronous `require`, which resolves builtins (`bun:sqlite`) and
// packages without the top-level static import that breaks Node tooling.
const bunRequire = (import.meta as unknown as { require: (id: string) => unknown }).require;

let cachedDatabase: DatabaseConstructor | undefined;
let cachedDrizzle: DrizzleFn | undefined;

/** Returns the `bun:sqlite` `Database` constructor, loading it on first use. */
export function loadSqlite(): DatabaseConstructor {
  if (!cachedDatabase) {
    cachedDatabase = (bunRequire('bun:sqlite') as typeof import('bun:sqlite')).Database;
  }
  return cachedDatabase;
}

/**
 * Returns the `drizzle-orm/bun-sqlite` factory, loading it on first use.
 * `drizzle-orm/bun-sqlite` transitively imports `bun:sqlite`, so it must
 * also be deferred to keep the barrel importable under Node tooling.
 */
export function loadDrizzle(): DrizzleFn {
  if (!cachedDrizzle) {
    cachedDrizzle = (
      bunRequire('drizzle-orm/bun-sqlite') as typeof import('drizzle-orm/bun-sqlite')
    ).drizzle;
  }
  return cachedDrizzle;
}
