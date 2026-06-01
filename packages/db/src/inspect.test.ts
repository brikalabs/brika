import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectDatabaseFile, inspectMigrationsFolder } from './inspect';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-inspect-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeJournal(folder: string, tags: string[]): void {
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: tags.map((tag, idx) => ({ idx, version: '6', when: idx, tag, breakpoints: true })),
    })
  );
}

function writeSql(folder: string, tag: string): void {
  writeFileSync(join(folder, `${tag}.sql`), '-- noop\n');
}

describe('inspectMigrationsFolder', () => {
  test('reports a healthy folder with no drift', () => {
    writeJournal(dir, ['0000_init', '0001_more']);
    writeSql(dir, '0000_init');
    writeSql(dir, '0001_more');

    const report = inspectMigrationsFolder(dir);
    expect(report.orphanSql).toEqual([]);
    expect(report.missingSql).toEqual([]);
    expect(report.journalTags).toEqual(['0000_init', '0001_more']);
  });

  test('flags a SQL file that is not in the journal as an orphan', () => {
    // Exactly the granted_capabilities bug: a .sql file on disk that no
    // journal entry references, so the macro loader never runs it.
    writeJournal(dir, ['0000_init']);
    writeSql(dir, '0000_init');
    writeSql(dir, '0001_orphan');

    const report = inspectMigrationsFolder(dir);
    expect(report.orphanSql).toEqual(['0001_orphan']);
    expect(report.missingSql).toEqual([]);
  });

  test('flags a journal entry whose SQL file is missing', () => {
    writeJournal(dir, ['0000_init', '0001_gone']);
    writeSql(dir, '0000_init');

    const report = inspectMigrationsFolder(dir);
    expect(report.missingSql).toEqual(['0001_gone']);
    expect(report.orphanSql).toEqual([]);
  });

  test('flags missing snapshots and clears them when present', () => {
    writeJournal(dir, ['0000_init']);
    writeSql(dir, '0000_init');
    expect(inspectMigrationsFolder(dir).missingSnapshots).toEqual(['0000_init']);

    writeFileSync(join(dir, 'meta', '0000_init.json'), '{}');
    expect(inspectMigrationsFolder(dir).missingSnapshots).toEqual([]);
  });
});

describe('inspectDatabaseFile', () => {
  test('reports tables, row counts and applied migrations', () => {
    const dbPath = join(dir, 'test.db');
    const db = new Database(dbPath, { create: true });
    db.run('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)');
    db.run("INSERT INTO widgets (name) VALUES ('a'), ('b')");
    db.run(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC)'
    );
    db.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('h0', 1), ('h1', 2)");
    db.close();

    const report = inspectDatabaseFile(dbPath);
    expect(report.exists).toBe(true);
    expect(report.sizeBytes).toBeGreaterThan(0);
    expect(report.appliedMigrations).toBe(2);
    expect(report.tables).toEqual([{ name: 'widgets', rows: 2 }]);
  });

  test('reports a non-existent file gracefully', () => {
    const report = inspectDatabaseFile(join(dir, 'missing.db'));
    expect(report.exists).toBe(false);
    expect(report.tables).toEqual([]);
    expect(report.appliedMigrations).toBe(0);
  });
});
