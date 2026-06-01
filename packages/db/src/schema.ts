/**
 * Pure schema surface — Drizzle table builders, column types, query
 * operators and inference helpers. **This module imports nothing from
 * `bun:sqlite`** (directly or transitively), so it is safe to load under
 * plain Node, which is what `drizzle-kit generate/studio` does.
 *
 * `schema.ts` files MUST import their builders from `@brika/db/schema`,
 * not from `@brika/db`. The barrel (`@brika/db`) re-exports everything
 * here *and* the runtime opener (`defineDatabase`, which pulls in
 * `bun:sqlite`); importing the barrel from a schema file drags the Bun
 * SQLite runtime into drizzle-kit's Node process and breaks `generate`
 * with `Cannot find module 'bun:sqlite'`.
 *
 * Runtime code (stores, repositories) can import operators from either
 * path; it runs under Bun where `bun:sqlite` resolves fine.
 */

// Query operators.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  notInArray,
  or,
  type SQL,
  sql,
  sum,
} from 'drizzle-orm';
// Table + column builders.
export {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
