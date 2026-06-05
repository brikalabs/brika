/**
 * Read-only access to the update preferences the hub persists in
 * `state.db` (the `settings` table: `updateChannel`, `updatePinnedVersion`).
 *
 * This lets the CLI honour the channel/pin the user picked in the hub or
 * UI without booting the hub runtime or going through the HTTP API. The
 * file is opened read-only — no migrations, no WAL writes — so it is safe
 * to call while a hub holds the database (SQLite WAL permits concurrent
 * readers). When the file or `settings` table is absent (fresh install,
 * hub never started) or the row can't be read, it falls back to the
 * default channel rather than throwing: a missing preference must never
 * block a manual update.
 *
 * Writes stay with the hub on purpose. The channel preference is the
 * hub's to own (it drives background auto-update), so the CLI reads it
 * but never persists it — see `--channel` in `commands/update.ts`, which
 * is a per-run override only.
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { brikaContext } from '../context/brika-context';
import { DEFAULT_CHANNEL_ID, UPDATE_CHANNEL_IDS, type UpdateChannelId } from './channels';

const UpdateChannelSchema = z.enum(UPDATE_CHANNEL_IDS);

export interface UpdatePrefs {
  readonly channel: UpdateChannelId;
  readonly pinnedVersion: string | null;
}

const DEFAULT_PREFS: UpdatePrefs = { channel: DEFAULT_CHANNEL_ID, pinnedVersion: null };

/**
 * Path the hub opens `state.db` at. Mirrors `bootstrap.ts`, which calls
 * `configureDatabases(`${rootDir}/.brika`)`; the db layer then resolves
 * `state.db` to `${rootDir}/.brika/db/state.db`. `brikaContext.rootDir`
 * is the same value the hub's config loader reports, so this resolves to
 * the exact file the running hub uses.
 */
function stateDbPath(): string {
  return join(brikaContext.rootDir, '.brika', 'db', 'state.db');
}

/** Read one JSON-encoded `settings` value, or `undefined` when absent/unparseable. */
function readSetting(db: Database, key: string): unknown {
  const row = db
    .query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get(key);
  if (!row) {
    return undefined;
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

/**
 * Read the persisted update channel + pinned version. Never throws —
 * any failure (missing file, locked DB, schema mismatch, corrupt row)
 * resolves to {@link DEFAULT_PREFS}.
 *
 * `dbPath` defaults to the running hub's `state.db`; it's a parameter so
 * tests can point at a fixture without redirecting `brikaContext`.
 */
export function readUpdatePrefs(dbPath: string = stateDbPath()): UpdatePrefs {
  // `new Database(path, { readonly: true })` throws if the file is
  // missing, so guard first and skip straight to defaults.
  if (!existsSync(dbPath)) {
    return DEFAULT_PREFS;
  }

  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const channel = UpdateChannelSchema.safeParse(readSetting(db, 'updateChannel'));
    const pinned = readSetting(db, 'updatePinnedVersion');
    return {
      channel: channel.success ? channel.data : DEFAULT_CHANNEL_ID,
      pinnedVersion: typeof pinned === 'string' ? pinned : null,
    };
  } catch {
    return DEFAULT_PREFS;
  } finally {
    db?.close();
  }
}
