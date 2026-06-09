import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import { runEvents, runs } from './schema';

const migrations = loadMigrations('apps/hub/src/runtime/workflows/runs/migrations');

export const workflowsDb = defineDatabase('workflows.db', { runs, runEvents }, migrations);
