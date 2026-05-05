import { defineDatabase } from '@brika/db';
import { sessions, users } from './schema';
import migrationsTar from './migrations.tar';

export const authDb = defineDatabase('auth.db', { users, sessions }, migrationsTar);
