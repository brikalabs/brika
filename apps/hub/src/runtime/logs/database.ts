import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { logs } from './schema';

const migrations = loadMigrations('apps/hub/src/runtime/logs/migrations');

export const logsDb = defineDatabase('logs.db', { logs }, migrations);
