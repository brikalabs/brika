import { defineDatabase } from '@brika/db';
import { plugins, settings } from './schema';

export const stateDb = defineDatabase('state.db', { plugins, settings }, import.meta);
