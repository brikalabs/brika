// Single entrypoint for application code: schema builders, query operators,
// `defineDatabase`/`defineMigration`, and query helpers. Diagnostics and
// migration-runner internals live in `@brika/db/tooling` (used by the CLI)
// so they don't clutter this surface. The barrel stays loadable under plain
// Node (for `drizzle-kit`) because `bun:sqlite` is deferred to call time
// (see `sqlite.ts`).

export { configureDatabases } from './config';
export { type BrikaDatabase, type DatabaseDefinition, defineDatabase } from './database';
export { cursorFilter, endTsFilter, oneOrMany, startTsFilter } from './helpers';
export {
  type CodeMigration,
  defineMigration,
  type Migration,
  type MigrationContext,
  type MigrationDatabase,
  type SqlMigration,
} from './migration';
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
