import { describe, expect, test } from 'bun:test';
import { databaseSource, deriveNames, schemaSource } from './scaffold';

describe('deriveNames', () => {
  test('derives table, file and binding from a simple name', () => {
    expect(deriveNames('widgets')).toEqual({
      table: 'widgets',
      dbFile: 'widgets.db',
      binding: 'widgetsDb',
    });
  });

  test('camel-cases a snake_case name for the binding', () => {
    expect(deriveNames('user_sessions')).toEqual({
      table: 'user_sessions',
      dbFile: 'user_sessions.db',
      binding: 'userSessionsDb',
    });
  });

  test('strips a trailing .db suffix', () => {
    expect(deriveNames('widgets.db').dbFile).toBe('widgets.db');
  });

  test('trims surrounding whitespace', () => {
    expect(deriveNames('  widgets  ').table).toBe('widgets');
  });

  test.each([
    ['empty', ''],
    ['leading digit', '1widgets'],
    ['camelCase', 'userSessions'],
    ['kebab-case', 'user-sessions'],
    ['trailing underscore', 'widgets_'],
    ['double underscore', 'a__b'],
    ['uppercase', 'Widgets'],
  ])('rejects an invalid name (%s)', (_label, name) => {
    expect(() => deriveNames(name)).toThrow('Invalid database name');
  });
});

describe('schemaSource', () => {
  test('emits a sqliteTable importing from @brika/db', () => {
    const out = schemaSource('widgets');
    expect(out).toContain("from '@brika/db'");
    expect(out).toContain("sqliteTable('widgets'");
    expect(out).toContain('primaryKey');
  });
});

describe('databaseSource', () => {
  test('wires defineDatabase with the binding, db file, and migrations path', () => {
    const out = databaseSource(
      { table: 'widgets', dbFile: 'widgets.db', binding: 'widgetsDb' },
      'packages/widgets/src/migrations'
    );
    expect(out).toContain('import * as schema');
    expect(out).toContain('export const widgetsDb = defineDatabase(');
    expect(out).toContain("'widgets.db'");
    expect(out).toContain("loadMigrations('packages/widgets/src/migrations')");
    expect(out).toContain("with { type: 'macro' }");
  });
});
