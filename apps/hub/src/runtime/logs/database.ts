import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import * as schema from './schema';

export const logsDb = defineDatabase(
  'logs.db',
  schema,
  loadMigrations('apps/hub/src/runtime/logs/migrations')
);
