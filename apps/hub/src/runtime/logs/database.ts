import { defineDatabase } from '@brika/db';
import { logs } from './schema';

export const logsDb = defineDatabase('logs.db', { logs }, import.meta);
