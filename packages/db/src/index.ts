// Single entrypoint for everything: schema builders, query operators,
// `defineDatabase`/`defineMigration`, and the inspection helpers. Schema
// files and runtime code both import from `@brika/db`. The barrel stays
// loadable under plain Node (for `drizzle-kit`) because the `bun:sqlite`
// runtime is deferred to call time (see `sqlite.ts`).

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
  type DashboardInput,
  formatBytes,
  migrationStatus,
  renderDashboard,
  renderDatabases,
  renderMigrations,
} from './render';
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
