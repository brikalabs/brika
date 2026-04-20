import { index, integer, sqliteTable, text } from '@brika/db';

export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    level: text('level').notNull(),
    source: text('source').notNull(),
    pluginName: text('plugin_name'),
    message: text('message').notNull(),
    meta: text('meta'),
    errorName: text('error_name'),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    errorCause: text('error_cause'),
  },
  (table) => [
    index('idx_logs_ts').on(table.ts),
    index('idx_logs_level').on(table.level),
    index('idx_logs_source').on(table.source),
    index('idx_logs_plugin').on(table.pluginName),
    index('idx_logs_ts_level').on(table.ts, table.level),
    index('idx_logs_ts_source').on(table.ts, table.source),
  ],
);
