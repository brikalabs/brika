import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: process.env['BRIKA_SCHEMA'] ?? './src/schema.ts',
  out: process.env['BRIKA_OUT'] ?? './src/migrations',
  dialect: 'sqlite',
  ...(process.env['BRIKA_DB_URL'] ? { dbCredentials: { url: process.env['BRIKA_DB_URL'] } } : {}),
});
