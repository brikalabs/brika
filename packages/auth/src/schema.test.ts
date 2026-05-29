/**
 * @brika/auth - Schema tests
 *
 * The `users` and `sessions` tables defined in `schema.ts` each pass an arrow
 * function to drizzle's `sqliteTable(..., (table) => [index(...)])` builder.
 * That callback is the table's `drizzle:ExtraConfigBuilder` and is invoked
 * lazily — never by simple runtime queries. Without exercising it explicitly,
 * the file reports 66.67% functions coverage.
 *
 * These tests invoke each table's extra-config builder directly and assert
 * the resulting index list (count and configured columns) matches what the
 * schema declares. Any breakage in the index declarations — wrong column,
 * missing index, accidental removal — surfaces here.
 */

import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { sessions, users } from './schema';

const BUILDER_SYM = 'drizzle:ExtraConfigBuilder';
const COLUMNS_SYM = 'drizzle:ExtraConfigColumns';
const FK_SYM = 'drizzle:SQLiteInlineForeignKeys';

/** Shape of a drizzle `index(...).on(col)` result we care about. */
const indexShape = z.object({
  config: z.object({
    name: z.string(),
    columns: z.array(z.object({ name: z.string() })),
  }),
});
type IndexShape = z.infer<typeof indexShape>;

/** Shape of a drizzle inline foreign-key entry we care about. */
const foreignKeyShape = z.object({
  reference: z.function(),
});

function findSymbol(target: object, description: string): symbol {
  const sym = Object.getOwnPropertySymbols(target).find((s) => s.description === description);
  if (!sym) {
    throw new Error(`drizzle table is missing symbol: ${description}`);
  }
  return sym;
}

function readBuilder(table: object): (cols: unknown) => unknown {
  const sym = findSymbol(table, BUILDER_SYM);
  const value = Reflect.get(table, sym);
  if (typeof value !== 'function') {
    throw new TypeError(`expected ${BUILDER_SYM} to be a function`);
  }
  return value.bind(table);
}

function readColumns(table: object): unknown {
  const sym = findSymbol(table, COLUMNS_SYM);
  return Reflect.get(table, sym);
}

function runBuilder(table: object): IndexShape[] {
  const builder = readBuilder(table);
  const cols = readColumns(table);
  const result = builder(cols);
  return z.array(indexShape).parse(result);
}

describe('schema.users', () => {
  it('declares an index on the email column', () => {
    const indexes = runBuilder(users);

    expect(indexes).toHaveLength(1);
    const [first] = indexes;
    if (!first) {
      throw new Error('expected at least one index on users');
    }
    expect(first.config.name).toBe('idx_users_email');
    expect(first.config.columns.map((c) => c.name)).toEqual(['email']);
  });
});

describe('schema.sessions', () => {
  it('declares indexes on token_hash and user_id', () => {
    const indexes = runBuilder(sessions);

    expect(indexes).toHaveLength(2);

    const byName = new Map(
      indexes.map((i) => [i.config.name, i.config.columns.map((c) => c.name)])
    );
    expect(byName.get('idx_sessions_token_hash')).toEqual(['token_hash']);
    expect(byName.get('idx_sessions_user_id')).toEqual(['user_id']);
  });

  it('resolves its user_id foreign key to users.id', () => {
    const fkSym = findSymbol(sessions, FK_SYM);
    const rawFks = Reflect.get(sessions, fkSym);
    const fks = z.array(foreignKeyShape).parse(rawFks);

    expect(fks).toHaveLength(1);
    const [fk] = fks;
    if (!fk) {
      throw new Error('expected at least one foreign key on sessions');
    }
    // Invoking `reference()` runs the `() => users.id` arrow inside `references(...)`.
    // Without this call, that arrow is uncovered and `schema.ts` reports 66.67% functions.
    const resolved = fk.reference();
    const parsed = z
      .object({
        columns: z.array(z.object({ name: z.string() })),
        foreignColumns: z.array(z.object({ name: z.string() })),
      })
      .parse(resolved);
    expect(parsed.columns.map((c) => c.name)).toEqual(['user_id']);
    expect(parsed.foreignColumns.map((c) => c.name)).toEqual(['id']);
  });
});
