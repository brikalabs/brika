import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SqlMigration } from './migration';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

/**
 * Build-time macro: read a migrations folder and return tagged
 * {@link SqlMigration} records, inlined into the binary. Iterates
 * `meta/_journal.json` in order; for each tag it reads `<tag>.sql`,
 * splits it into statements, and hashes the file with SHA-256.
 *
 * The hash is computed exactly as `drizzle-kit` does (SHA-256 of the raw
 * file), so the runner's back-compat seed still matches the hashes a
 * pre-existing `__drizzle_migrations` table recorded.
 */
export function loadMigrations(repoRelativePath: string): SqlMigration[] {
  const folder = resolve(REPO_ROOT, repoRelativePath);
  const journal: unknown = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8'));
  return journalTags(journal).map((tag) => {
    const sql = readFileSync(join(folder, `${tag}.sql`), 'utf8');
    return {
      kind: 'sql',
      tag,
      hash: createHash('sha256').update(sql).digest('hex'),
      statements: sql.split(STATEMENT_BREAKPOINT),
    };
  });
}

function journalTags(journal: unknown): string[] {
  if (
    typeof journal !== 'object' ||
    journal === null ||
    !('entries' in journal) ||
    !Array.isArray(journal.entries)
  ) {
    return [];
  }
  const tags: string[] = [];
  for (const entry of journal.entries) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'tag' in entry &&
      typeof entry.tag === 'string'
    ) {
      tags.push(entry.tag);
    }
  }
  return tags;
}
