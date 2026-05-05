import { defineDatabase } from '@brika/db';
import { logs } from './schema';
import migrationsTar from './migrations.tar';

export const logsDb = defineDatabase('logs.db', { logs }, migrationsTar);
