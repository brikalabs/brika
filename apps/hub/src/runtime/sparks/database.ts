import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { sparks } from './schema';

const migrations = loadMigrations('apps/hub/src/runtime/sparks/migrations');

export const sparksDb = defineDatabase('sparks.db', { sparks }, migrations);
