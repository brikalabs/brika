import { defineDatabase } from '@brika/db';
import { cacheEntries, cacheTags } from './schema';

export const cacheDb = defineDatabase('cache.db', { cacheEntries, cacheTags }, import.meta);
