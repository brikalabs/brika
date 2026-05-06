import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { customThemes, plugins, settings } from './schema';

const migrations = loadMigrations('apps/hub/src/runtime/state/migrations');

export const stateDb = defineDatabase('state.db', { plugins, settings, customThemes }, migrations);
