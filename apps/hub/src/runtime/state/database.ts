import { defineDatabase } from '@brika/db';
import { customThemes, plugins, settings } from './schema';

export const stateDb = defineDatabase('state.db', { plugins, settings, customThemes }, import.meta);
