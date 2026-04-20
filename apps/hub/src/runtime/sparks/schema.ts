import { index, integer, sqliteTable, text } from '@brika/db';

export const sparks = sqliteTable(
  'sparks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    pluginId: text('plugin_id'),
    payload: text('payload'),
  },
  (table) => [
    index('idx_sparks_ts').on(table.ts),
    index('idx_sparks_type').on(table.type),
    index('idx_sparks_source').on(table.source),
    index('idx_sparks_plugin').on(table.pluginId),
    index('idx_sparks_ts_type').on(table.ts, table.type),
  ]
);
