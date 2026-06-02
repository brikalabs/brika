/**
 * `@brika/db/tooling` — diagnostics & migration-runner internals for the
 * `brika-db` CLI and any future admin/diagnostics surface. Kept off the
 * main `@brika/db` entrypoint so a feature dev defining a table sees only
 * builders, operators, and `defineDatabase`/`defineMigration` in
 * autocomplete — not `renderDashboard` or `applyMigrations`.
 */

export {
  type DatabaseFileReport,
  inspectDatabaseFile,
  inspectMigrationsFolder,
  type MigrationFolderReport,
  type TableInfo,
} from './inspect';
export { sortMigrations } from './migration';
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
  databaseSource,
  deriveNames,
  type ScaffoldNames,
  schemaSource,
} from './scaffold';
