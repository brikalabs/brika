import { index, integer, sqliteTable, text } from '@brika/db';

export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    timestamp: integer('timestamp').notNull(),
    ttl: integer('ttl').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    index('idx_cache_expires').on(table.expiresAt),
  ],
);

export const cacheTags = sqliteTable('cache_tags', {
  key: text('key').notNull().references(() => cacheEntries.key, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => [
  index('idx_cache_tags_tag').on(table.tag),
]);
