import { defineDatabase } from '@brika/db';
import { plugins, settings } from './schema';
import migrationsTar from './migrations.tar';

export const stateDb = defineDatabase('state.db', { plugins, settings }, migrationsTar);
