/**
 * `lazyDatabase` — a tiny holder for a database opened *after* construction.
 *
 * DI singletons (stores) are constructed before `configureDatabases()` runs
 * at boot, so they can't open in their constructor. The repeated pattern was:
 * a nullable `#database` field, an `init()` that opens it, a getter that
 * either throws or returns null when unopened, and a `close()`. This holder
 * captures all of that once and makes the unopened policy *explicit* at the
 * call site:
 *
 *   - `db` — throws if unopened (for stores that must be initialized first)
 *   - `dbOrNull` — returns null if unopened (for stores that tolerate
 *     pre-init calls, e.g. logging before boot completes)
 */

import type { BrikaDatabase, DatabaseDefinition } from './database';

type DrizzleHandle<TSchema extends Record<string, unknown>> = BrikaDatabase<TSchema>['db'];

export interface LazyDatabase<TSchema extends Record<string, unknown>> {
  /** Open (or reopen) the database, running pending migrations. */
  open(path?: string): BrikaDatabase<TSchema>;
  /** Close the underlying SQLite connection and reset to unopened. */
  close(): void;
  /** `true` once `open()` has been called (and not since closed). */
  readonly opened: boolean;
  /** Drizzle handle; throws if not opened yet. */
  readonly db: DrizzleHandle<TSchema>;
  /** Drizzle handle, or `null` if not opened — for pre-init-tolerant callers. */
  readonly dbOrNull: DrizzleHandle<TSchema> | null;
}

export function lazyDatabase<TSchema extends Record<string, unknown>>(
  definition: DatabaseDefinition<TSchema>,
  label = 'database'
): LazyDatabase<TSchema> {
  let handle: BrikaDatabase<TSchema> | null = null;
  return {
    open(path?: string) {
      handle = definition.open(path);
      return handle;
    },
    close() {
      handle?.sqlite.close();
      handle = null;
    },
    get opened() {
      return handle !== null;
    },
    get db() {
      if (!handle) {
        throw new Error(`${label} not opened — call open() first`);
      }
      return handle.db;
    },
    get dbOrNull() {
      return handle?.db ?? null;
    },
  };
}
