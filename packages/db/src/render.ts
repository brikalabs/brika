/**
 * Pure renderers for the `brika-db` dev tool — migration drift and
 * on-disk database status formatted as plain text. Kept pure (data in,
 * string out) so the interactive TUI in `bin/` is a thin loop over
 * fully-tested rendering.
 */

import type { DatabaseFileReport, MigrationFolderReport } from './inspect';

const GLYPH = { ok: '✓', warn: '⚠', problem: '✗' } as const;

/** Human-readable byte size (`1536` → `1.5 KB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Health of a single migrations folder. */
export function migrationStatus(report: MigrationFolderReport): 'ok' | 'warn' | 'problem' {
  if (report.orphanSql.length > 0 || report.missingSql.length > 0) {
    return 'problem';
  }
  if (report.baselineSnapshotMissing) {
    return 'warn';
  }
  return 'ok';
}

/** One line per migrations folder, prefixed with a status glyph. */
export function renderMigrations(reports: readonly MigrationFolderReport[]): string {
  if (reports.length === 0) {
    return 'Migrations\n  (none found)';
  }
  const lines = reports.map((report) => {
    const status = migrationStatus(report);
    const detail = migrationDetail(report, status);
    return `  ${GLYPH[status]} ${shortenFolder(report.folder)}${detail}`;
  });
  return ['Migrations', ...lines].join('\n');
}

/** Show the meaningful tail of a folder path (last 3 segments). */
function shortenFolder(folder: string): string {
  return folder.split('/').filter(Boolean).slice(-3).join('/');
}

function migrationDetail(report: MigrationFolderReport, status: 'ok' | 'warn' | 'problem'): string {
  if (status === 'problem') {
    const orphan = report.orphanSql.map((t) => `orphan ${t}.sql`);
    const missing = report.missingSql.map((t) => `missing ${t}.sql`);
    return `  — ${[...orphan, ...missing].join(', ')}`;
  }
  if (status === 'warn') {
    return '  — baseline snapshot missing';
  }
  return `  ${report.journalTags.length} migration${report.journalTags.length === 1 ? '' : 's'}`;
}

/** One line per database file with size, applied count and row totals. */
export function renderDatabases(reports: readonly DatabaseFileReport[]): string {
  const present = reports.filter((r) => r.exists);
  if (present.length === 0) {
    return 'Databases\n  (none found)';
  }
  const lines = present.map((report) => {
    const size = formatBytes(report.sizeBytes + report.walBytes);
    const tables = report.tables.map((t) => `${t.name}:${t.rows}`).join(' ');
    return `  ${basename(report.path)}  ${size}  ${report.appliedMigrations} applied  ${tables}`.trimEnd();
  });
  return ['Databases', ...lines].join('\n');
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export interface DashboardInput {
  readonly migrations: readonly MigrationFolderReport[];
  readonly databases: readonly DatabaseFileReport[];
}

/** Full dashboard: a header, the migration board, and the database board. */
export function renderDashboard(input: DashboardInput): string {
  return [
    'BRIKA · databases & migrations',
    '',
    renderMigrations(input.migrations),
    '',
    renderDatabases(input.databases),
  ].join('\n');
}
