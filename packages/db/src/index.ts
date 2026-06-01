// ORM query operators + schema builders — consumers import from here, not
// drizzle-orm directly, so swapping the underlying ORM only touches this
// package. The pure definitions live in `./schema` (no `bun:sqlite`), so
// `schema.ts` files can import them under drizzle-kit's Node runtime via
// the `@brika/db/schema` subpath. The barrel re-exports them for the
// convenience of runtime code (which runs under Bun).

export { configureDatabases } from './config';
export { type BrikaDatabase, type DatabaseDefinition, defineDatabase } from './database';
export { cursorFilter, endTsFilter, oneOrMany, startTsFilter } from './helpers';
export {
  type DatabaseFileReport,
  inspectDatabaseFile,
  inspectMigrationsFolder,
  type MigrationFolderReport,
  type TableInfo,
} from './inspect';
export {
  type CodeMigration,
  defineMigration,
  type Migration,
  type MigrationContext,
  type MigrationDatabase,
  type SqlMigration,
  sortMigrations,
} from './migration';
export { applyMigrations, LEDGER_TABLE, type MigrationOutcome } from './migrator';
export {
  and,
  asc,
  blob,
  count,
  desc,
  eq,
  gt,
  gte,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  index,
  integer,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  notInArray,
  or,
  real,
  type SQL,
  sql,
  sqliteTable,
  sum,
  text,
  uniqueIndex,
} from './schema';
