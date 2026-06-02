import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import * as schema from './schema';

export const cacheDb = defineDatabase(
  'cache.db',
  schema,
  loadMigrations('packages/http/src/cache/migrations')
);
