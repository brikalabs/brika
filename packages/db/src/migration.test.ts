import { describe, expect, test } from 'bun:test';
import {
  type CodeMigration,
  defineMigration,
  type Migration,
  type SqlMigration,
  sortMigrations,
} from './migration';

function sql(tag: string): SqlMigration {
  return { kind: 'sql', tag, hash: tag, statements: [] };
}

describe('defineMigration', () => {
  test('builds a code migration with the given tag and run fn', () => {
    let ran = false;
    const migration: CodeMigration = defineMigration('0001_do_thing', () => {
      ran = true;
    });
    expect(migration.kind).toBe('code');
    expect(migration.tag).toBe('0001_do_thing');

    // @ts-expect-error — exercising the callback without a real context.
    migration.run({});
    expect(ran).toBe(true);
  });

  test('accepts multi-word snake_case tags', () => {
    expect(defineMigration('0012_backfill_user_scores', () => {}).tag).toBe(
      '0012_backfill_user_scores'
    );
  });

  test.each([
    ['no numeric prefix', 'backfill_scores'],
    ['too few digits', '001_backfill'],
    ['camelCase name', '0001_backfillScores'],
    ['trailing underscore', '0001_backfill_'],
    ['uppercase', '0001_Backfill'],
    ['spaces', '0001 backfill'],
  ])('rejects an invalid tag (%s)', (_label, tag) => {
    expect(() => defineMigration(tag, () => {})).toThrow('Invalid migration tag');
  });
});

describe('sortMigrations', () => {
  test('sorts by tag ascending', () => {
    const out = sortMigrations([sql('0002_c'), sql('0000_a'), sql('0001_b')]);
    expect(out.map((m) => m.tag)).toEqual(['0000_a', '0001_b', '0002_c']);
  });

  test('interleaves sql and code migrations by tag', () => {
    const code = defineMigration('0001_mid', () => {});
    const out: Migration[] = sortMigrations([sql('0002_last'), code, sql('0000_first')]);
    expect(out.map((m) => m.kind)).toEqual(['sql', 'code', 'sql']);
  });

  test('throws on duplicate tags', () => {
    expect(() => sortMigrations([sql('0000_a'), sql('0000_a')])).toThrow(
      'Duplicate migration tag "0000_a"'
    );
  });

  test('does not mutate the input array', () => {
    const input = [sql('0001_b'), sql('0000_a')];
    sortMigrations(input);
    expect(input.map((m) => m.tag)).toEqual(['0001_b', '0000_a']);
  });

  test('handles an empty list', () => {
    expect(sortMigrations([])).toEqual([]);
  });
});
