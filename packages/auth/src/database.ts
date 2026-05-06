import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { sessions, users } from './schema';

const migrations = loadMigrations('packages/auth/src/migrations');

export const authDb = defineDatabase('auth.db', { users, sessions }, migrations);
