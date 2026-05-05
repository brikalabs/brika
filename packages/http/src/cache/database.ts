import { defineDatabase } from '@brika/db';
import { cacheEntries, cacheTags } from './schema';
import migrationsTar from './migrations.tar';

export const cacheDb = defineDatabase('cache.db', { cacheEntries, cacheTags }, migrationsTar);
