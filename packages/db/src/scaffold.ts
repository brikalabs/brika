/**
 * Pure source generators for `brika-db new` — scaffold a database's
 * `schema.ts` and `database.ts`. Kept pure (names in, source out) so the
 * file-writing/orchestration in `bin/` stays a thin, coverage-exempt
 * shell over fully-tested generation.
 */

export interface ScaffoldNames {
  /** Table + logical name, snake_case (`user_sessions`). */
  readonly table: string;
  /** SQLite filename (`user_sessions.db`). */
  readonly dbFile: string;
  /** Exported binding (`userSessionsDb`). */
  readonly binding: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * Derive the table name, db filename, and export binding from a raw name.
 * Accepts an optional `.db` suffix. Throws on anything but snake_case.
 */
export function deriveNames(rawName: string): ScaffoldNames {
  const table = rawName.trim().replace(/\.db$/, '');
  if (!NAME_PATTERN.test(table)) {
    throw new Error(
      `Invalid database name "${rawName}": expected snake_case (e.g. "widgets" or "user_sessions").`
    );
  }
  return {
    table,
    dbFile: `${table}.db`,
    binding: `${toCamelCase(table)}Db`,
  };
}

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/** Source for a starter `schema.ts` with one table. */
export function schemaSource(table: string): string {
  return `import { integer, sqliteTable, text } from '@brika/db';

export const ${table} = sqliteTable('${table}', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});
`;
}

/** Source for `database.ts`, wired with the (build-checked) migrations path. */
export function databaseSource(names: ScaffoldNames, migrationsRepoPath: string): string {
  return `import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import * as schema from './schema';

export const ${names.binding} = defineDatabase(
  '${names.dbFile}',
  schema,
  loadMigrations('${migrationsRepoPath}')
);
`;
}
