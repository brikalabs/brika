import { index, integer, sqliteTable, text } from '@brika/db';

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    name: text('name').notNull(),
    source: text('source').notNull(),
    distinctId: text('distinct_id'),
    userId: text('user_id'),
    pluginName: text('plugin_name'),
    props: text('props'),
  },
  (table) => [
    index('idx_events_ts').on(table.ts),
    index('idx_events_name').on(table.name),
    index('idx_events_source').on(table.source),
    index('idx_events_plugin').on(table.pluginName),
    index('idx_events_user').on(table.userId),
    index('idx_events_ts_name').on(table.ts, table.name),
  ]
);
