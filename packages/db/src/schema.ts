/**
 * Internal pure-builder module — Drizzle table builders, column types,
 * query operators and inference helpers, re-exported by the package
 * barrel (`@brika/db`). Imports nothing from `bun:sqlite`.
 *
 * Consumers never import this file directly: everything is available from
 * the single `@brika/db` entrypoint. The barrel stays loadable under
 * plain Node (which is what `drizzle-kit generate/studio` runs) because
 * `@brika/db` defers its `bun:sqlite` / drizzle-bun-sqlite imports to
 * call time (see `sqlite.ts`), so a `schema.ts` importing `@brika/db`
 * doesn't drag the Bun SQLite runtime into the Node tool.
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
