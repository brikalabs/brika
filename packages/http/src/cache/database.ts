import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { cacheEntries, cacheTags } from './schema';

const migrations = loadMigrations('packages/http/src/cache/migrations');

export const cacheDb = defineDatabase('cache.db', { cacheEntries, cacheTags }, migrations);
