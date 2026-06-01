/**
 * Repo-wide guard: every first-party migrations folder must be free of
 * journal/SQL drift. This is the regression test for the orphaned
 * `0002_granted_capabilities.sql` that sat in the tree unreferenced by
 * the journal (and therefore never ran). If a future migration is added
 * without updating `_journal.json`, this fails in CI instead of shipping
 * a silently-dead migration.
 *
 * Snapshots are checked separately (a warning, not a failure) because
 * they only affect the `generate` workflow, not runtime correctness.
 */

import { expect, test } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { inspectMigrationsFolder } from './inspect';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

async function findMigrationFolders(): Promise<string[]> {
  const glob = new Bun.Glob('**/migrations/meta/_journal.json');
  const folders: string[] = [];
  for await (const abs of glob.scan({ cwd: REPO_ROOT, absolute: true, onlyFiles: true })) {
    if (abs.includes('node_modules')) {
      continue;
    }
    folders.push(dirname(dirname(abs)));
  }
  return folders.sort();
}

test('every migrations folder is free of orphan / missing SQL', async () => {
  const folders = await findMigrationFolders();
  // Sanity: we expect to discover the known domains, not silently zero.
  expect(folders.length).toBeGreaterThan(0);

  const drift: string[] = [];
  for (const folder of folders) {
    const report = inspectMigrationsFolder(folder);
    const rel = folder.replace(`${REPO_ROOT}/`, '');
    for (const tag of report.orphanSql) {
      drift.push(`${rel}: orphan SQL ${tag}.sql not referenced by _journal.json`);
    }
    for (const tag of report.missingSql) {
      drift.push(`${rel}: journal references ${tag} but ${tag}.sql is missing`);
    }
  }

  expect(drift).toEqual([]);
});
