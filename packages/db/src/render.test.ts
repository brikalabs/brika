import { describe, expect, test } from 'bun:test';
import type { DatabaseFileReport, MigrationFolderReport } from './inspect';
import {
  formatBytes,
  migrationStatus,
  renderDashboard,
  renderDatabases,
  renderMigrations,
} from './render';

function folder(over: Partial<MigrationFolderReport>): MigrationFolderReport {
  return {
    folder: '/home/user/brika/packages/auth/src/migrations',
    journalTags: ['0000_init'],
    sqlFiles: ['0000_init'],
    orphanSql: [],
    missingSql: [],
    baselineSnapshotMissing: false,
    ...over,
  };
}

function dbFile(over: Partial<DatabaseFileReport>): DatabaseFileReport {
  return {
    path: '/home/user/.brika/db/state.db',
    exists: true,
    sizeBytes: 32768,
    walBytes: 0,
    tables: [{ name: 'plugins', rows: 6 }],
    appliedMigrations: 2,
    ...over,
  };
}

describe('formatBytes', () => {
  test.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [5 * 1024 * 1024 * 1024, '5.0 GB'],
  ])('%i bytes → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('migrationStatus', () => {
  test('ok when healthy', () => {
    expect(migrationStatus(folder({}))).toBe('ok');
  });
  test('warn when baseline snapshot missing', () => {
    expect(migrationStatus(folder({ baselineSnapshotMissing: true }))).toBe('warn');
  });
  test('problem when an orphan SQL file is present', () => {
    expect(migrationStatus(folder({ orphanSql: ['0002_x'] }))).toBe('problem');
  });
  test('problem when a SQL file is missing', () => {
    expect(migrationStatus(folder({ missingSql: ['0003_y'] }))).toBe('problem');
  });
});

describe('renderMigrations', () => {
  test('reports "none found" for an empty list', () => {
    expect(renderMigrations([])).toBe('Migrations\n  (none found)');
  });

  test('renders a healthy folder with a shortened path and plural count', () => {
    const out = renderMigrations([folder({ journalTags: ['0000_init', '0001_more'] })]);
    expect(out).toContain('✓ auth/src/migrations');
    expect(out).toContain('2 migrations');
  });

  test('uses the singular "migration" for a single entry', () => {
    expect(renderMigrations([folder({})])).toContain('1 migration');
  });

  test('shows orphan and missing detail for a problem folder', () => {
    const out = renderMigrations([folder({ orphanSql: ['0002_x'], missingSql: ['0003_y'] })]);
    expect(out).toContain('✗');
    expect(out).toContain('orphan 0002_x.sql');
    expect(out).toContain('missing 0003_y.sql');
  });

  test('shows a warning detail when the baseline snapshot is missing', () => {
    const out = renderMigrations([folder({ baselineSnapshotMissing: true })]);
    expect(out).toContain('⚠');
    expect(out).toContain('baseline snapshot missing');
  });
});

describe('renderDatabases', () => {
  test('reports "none found" when no databases exist', () => {
    expect(renderDatabases([])).toBe('Databases\n  (none found)');
    expect(renderDatabases([dbFile({ exists: false })])).toBe('Databases\n  (none found)');
  });

  test('renders size (incl. WAL), applied count and table rows', () => {
    const out = renderDatabases([
      dbFile({ walBytes: 8192, tables: [{ name: 'plugins', rows: 6 }] }),
    ]);
    expect(out).toContain('state.db');
    expect(out).toContain('40.0 KB');
    expect(out).toContain('2 applied');
    expect(out).toContain('plugins:6');
  });

  test('trims trailing space when a database has no tables', () => {
    const out = renderDatabases([dbFile({ tables: [] })]);
    expect(out.endsWith(' ')).toBe(false);
    expect(out).toContain('state.db');
  });

  test('uses the full path as the name when there is no slash', () => {
    expect(renderDatabases([dbFile({ path: 'mem.db', tables: [] })])).toContain('mem.db');
  });
});

describe('renderDashboard', () => {
  test('combines header, migrations and databases', () => {
    const out = renderDashboard({ migrations: [folder({})], databases: [dbFile({})] });
    expect(out).toContain('BRIKA · databases & migrations');
    expect(out).toContain('Migrations');
    expect(out).toContain('Databases');
  });
});
