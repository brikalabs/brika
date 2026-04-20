import { integer, sqliteTable, text } from '@brika/db';
import type { PluginHealth } from '@brika/plugin';

export const plugins = sqliteTable('plugins', {
  name: text('name').primaryKey(),
  rootDirectory: text('root_directory').notNull(),
  entryPoint: text('entry_point').notNull(),
  uid: text('uid').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  health: text('health')
    .$type<PluginHealth>()
    .notNull()
    .default('restarting' satisfies PluginHealth),
  lastError: text('last_error'),
  updatedAt: integer('updated_at').notNull(),
  grantedPermissions: text('granted_permissions'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
