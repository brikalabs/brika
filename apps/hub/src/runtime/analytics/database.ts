import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { events } from './schema';

const migrations = loadMigrations('apps/hub/src/runtime/analytics/migrations');

export const eventsDb = defineDatabase('events.db', { events }, migrations);
