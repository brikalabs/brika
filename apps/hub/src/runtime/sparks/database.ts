import { defineDatabase } from '@brika/db';
import { sparks } from './schema';

export const sparksDb = defineDatabase('sparks.db', { sparks }, import.meta);
