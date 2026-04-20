import { defineDatabase } from '@brika/db';
import { sessions, users } from './schema';

export const authDb = defineDatabase('auth.db', { users, sessions }, import.meta);
