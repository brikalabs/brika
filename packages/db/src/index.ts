// ORM query operators — consumers import from here, not drizzle-orm directly.
// Swapping the underlying ORM only requires changing this package.
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
// Schema builders — consumers define their own table schemas using these, not drizzle directly.
export {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export { configureDatabases } from './config';
export { type BrikaDatabase, type DatabaseDefinition, defineDatabase } from './database';
export { cursorFilter, endTsFilter, oneOrMany, startTsFilter } from './helpers';
