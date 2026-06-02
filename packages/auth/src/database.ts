import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import * as schema from './schema';

export const authDb = defineDatabase(
  'auth.db',
  schema,
  loadMigrations('packages/auth/src/migrations')
);
