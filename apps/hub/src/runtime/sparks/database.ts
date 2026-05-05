import { defineDatabase } from '@brika/db';
import { sparks } from './schema';
import migrationsTar from './migrations.tar';

export const sparksDb = defineDatabase('sparks.db', { sparks }, migrationsTar);
