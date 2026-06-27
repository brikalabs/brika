/**
 * `plugin-data` migration scope: keeps `${brikaDir}/plugins/data/` tidy.
 *
 * The directory accumulates one subdir per *installed plugin UID*
 * (data/, cache/, tmp/). When a plugin is uninstalled, the row in
 * `state.db` is deleted but the on-disk subdir is left behind — across
 * many install/uninstall cycles that's wasted space and a leak of
 * stale cached responses. Pre-Phase-2, only the running hub's
 * `cleanupStale()` ran (and only on registered plugins that lost
 * their package.json); orphan UID dirs were never reclaimed.
 *
 * This scope runs at boot, *before* plugins load, so the prune
 * doesn't race with a plugin reading its own cache.
 */

import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pluginDataDir } from '../../plugins/fs-dirs';
import {
  type Migration,
  type MigrationContext,
  MigrationDeferred,
  type MigrationOutcome,
  type MigrationScope,
} from '../types';

const STATE_DB_FILENAME = 'state.db';

/**
 * 0001: Remove `plugins/data/<uid>/` dirs whose UID is not present
 * in `state.db`'s `plugins` table. Safe to re-run.
 *
 * We open the DB directly (read-only) so this can run before the
 * full hub DI container is up. The migration framework explicitly
 * does *not* depend on services that the bootstrap chain hasn't
 * instantiated yet.
 */
const pruneOrphans: Migration = {
  id: '0001-prune-orphans',
  description: 'Remove plugin-data dirs whose UID is no longer registered',
  run(ctx: MigrationContext): Promise<MigrationOutcome> {
    const dataRoot = pluginDataDir(ctx.brikaDir);
    if (!existsSync(dataRoot)) {
      return Promise.resolve({ changed: false });
    }

    const dbPath = join(ctx.brikaDir, 'db', STATE_DB_FILENAME);
    const knownUids = readKnownUids(dbPath);
    if (knownUids === null) {
      // Couldn't trust the DB (missing, locked, no `plugins` table).
      // Throw `MigrationDeferred` so the runner *doesn't* mark this
      // migration applied — otherwise on a fresh install the ledger
      // would lock the prune in as "done" and subsequent uninstalls
      // would leak orphan dirs forever. Deferred migrations are
      // retried on every boot until preconditions are met.
      return Promise.reject(new MigrationDeferred('state.db missing or has no plugins table'));
    }

    let removed = 0;
    for (const entry of readdirSync(dataRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || knownUids.has(entry.name)) {
        continue;
      }
      // Orphan — uninstall left this behind.
      rmSync(join(dataRoot, entry.name), { recursive: true, force: true });
      removed += 1;
    }
    // `changed` only when an orphan was actually reclaimed, so a clean install (the common case) does
    // not raise a "state updated" banner for having pruned nothing.
    return Promise.resolve({
      changed: removed > 0,
      detail: removed > 0 ? `pruned ${removed} orphan plugin-data dir(s)` : undefined,
    });
  },
};

/**
 * Returns the set of registered plugin UIDs, or `null` when the DB
 * can't be trusted. `null` distinguishes "definitely empty" (which
 * would mean every dir is an orphan) from "we don't know" (skip).
 */
function readKnownUids(dbPath: string): Set<string> | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    // `.all()` returns `unknown[]` — narrow each row with an explicit
    // type guard so we don't lean on `as` casts to satisfy the
    // workspace's no-`as` rule.
    const uids = new Set<string>();
    for (const row of db.query('SELECT uid FROM plugins').all()) {
      if (typeof row === 'object' && row !== null && 'uid' in row && typeof row.uid === 'string') {
        uids.add(row.uid);
      }
    }
    return uids;
  } catch {
    // Schema not present (pre-init) or DB busy. Treat as "unknown".
    return null;
  } finally {
    db.close();
  }
}

export const pluginDataScope: MigrationScope = {
  name: 'plugin-data',
  migrations: [pruneOrphans],
};
