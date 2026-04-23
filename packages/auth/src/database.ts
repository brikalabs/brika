import { defineDatabase } from '@brika/db';
import { sessions, userPreferences, users } from './schema';

export const authDb = defineDatabase('auth.db', { users, sessions, userPreferences }, import.meta);
