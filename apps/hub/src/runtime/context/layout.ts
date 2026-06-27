/**
 * Data-dir layout: the one-time migration from the flat `.brika/` layout to the
 * hidden `.brika/.system/` layout.
 *
 * Only the human-authored files stay at the data-dir root (`brika.yml`,
 * `boards/`, `workflows/`). Everything the hub manages lives under `.system/`.
 * This module owns the list of "internal" entries and the boot-time move.
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Leaf names (files and directories) that the hub manages and that belong under
 * `.system/`. Anything NOT in this list is left at the data-dir root, so the
 * human-authored config (`brika.yml`, `boards/`, `workflows/`, `.gitignore`)
 * is never touched.
 */
export const INTERNAL_ENTRIES: readonly string[] = [
  'db',
  'plugins',
  'instance.id',
  'cli-token',
  '.version-state.json',
  'updates.log',
  '.github-etag.json',
  '.update.lock',
  '.update-cache',
  'runtime',
  'secrets.json',
  'master.key',
  'metrics-history.json',
  'board-order.json',
];

/**
 * One-time relocation from the flat layout to `.system/`. Moves every known
 * internal entry still living at the data-dir root into `systemDir`.
 *
 * Idempotent: once an entry is in `.system`, the root copy is gone, so a
 * second run finds nothing to move. Best-effort: a failure to move one entry is
 * logged and skipped rather than aborting boot.
 *
 * Runs at module load (before instance.id is read) and uses `console.*` because
 * the structured logger is not wired yet at that point.
 */
export function relocateLegacyLayout(brikaDir: string, systemDir: string): void {
  const pending = INTERNAL_ENTRIES.filter(
    (name) => existsSync(join(brikaDir, name)) && !existsSync(join(systemDir, name))
  );
  if (pending.length === 0) {
    return;
  }
  mkdirSync(systemDir, { recursive: true });
  const moved: string[] = [];
  for (const name of pending) {
    try {
      renameSync(join(brikaDir, name), join(systemDir, name));
      moved.push(name);
    } catch (error) {
      console.warn(`[brika] Could not relocate "${name}" into ${systemDir}: ${String(error)}`);
    }
  }
  if (moved.length > 0) {
    console.warn(
      `[brika] Migrated internal files into ${systemDir} (${moved.join(', ')}). ` +
        'Only brika.yml, boards/ and workflows/ remain at the top level.'
    );
  }
}
