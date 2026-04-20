#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CliError, createCli, defineCommand } from '@brika/cli';

const SHARED_CONFIG = resolve(import.meta.dir, '../database.config.ts');

const schemaOption = {
  type: 'string',
  short: 's',
  description: 'Path to a schema.ts file',
} as const;

const dbOption = {
  type: 'string',
  description: 'Path to the SQLite database file',
} as const;

function requireSchema(schema: string | undefined): { schema: string; out: string } {
  if (!schema) { throw new CliError('--schema is required. Run brika-db help for usage.'); }
  const resolved = resolve(schema);
  return { schema: resolved, out: join(dirname(resolved), 'migrations') };
}

function buildEnv(schema: string, out: string, db?: string): typeof process.env {
  return {
    ...process.env,
    BRIKA_SCHEMA: schema,
    BRIKA_OUT: out,
    ...(db ? { BRIKA_DB_URL: db } : {}),
  };
}

const generate = defineCommand({
  name: 'generate',
  description: 'Generate SQL migrations from schema changes',
  options: { schema: schemaOption },
  examples: [
    'brika-db generate --schema apps/hub/src/runtime/logs/schema.ts',
    'brika-db generate --schema packages/auth/src/schema.ts',
  ],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    await Bun.$`bunx drizzle-kit generate --config=${SHARED_CONFIG}`.env(buildEnv(schema, out));
  },
});

const migrate = defineCommand({
  name: 'migrate',
  description: 'Apply pending migrations to a database',
  options: { schema: schemaOption, db: dbOption },
  examples: [
    'brika-db migrate --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db',
  ],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    await Bun.$`bunx drizzle-kit migrate --config=${SHARED_CONFIG}`.env(buildEnv(schema, out, values.db));
  },
});

const studio = defineCommand({
  name: 'studio',
  description: 'Open a database browser UI',
  options: { schema: schemaOption, db: dbOption },
  examples: [
    'brika-db studio --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db',
  ],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    await Bun.$`bunx drizzle-kit studio --config=${SHARED_CONFIG}`.env(buildEnv(schema, out, values.db));
  },
});

const status = defineCommand({
  name: 'status',
  description: 'Show applied / pending migrations',
  options: { schema: schemaOption, db: dbOption },
  examples: [
    'brika-db status --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db',
  ],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    const journalPath = join(out, 'meta/_journal.json');

    if (!existsSync(journalPath)) {
      throw new CliError(`No migrations found at: ${out}`);
    }

    const journal = JSON.parse(await Bun.file(journalPath).text()) as {
      entries: { tag: string; idx: number }[];
    };

    const resolvedDb = values.db ?? process.env['BRIKA_DB_URL'];
    const dbReady = resolvedDb !== undefined && existsSync(resolvedDb);

    if (!dbReady) {
      console.log(`Schema: ${schema}\nMigrations:`);
      for (const entry of journal.entries) { console.log(`  ○ ${entry.tag}`); }
      console.log(resolvedDb ? `\nDatabase not found at: ${resolvedDb}` : '\nTip: pass --db <path> to show applied status.');
      return;
    }

    const { Database } = await import('bun:sqlite');
    const sqlite = new Database(resolvedDb, { readonly: true });
    let appliedCount = 0;

    try {
      const row = sqlite.query<{ count: number }, []>('SELECT COUNT(*) as count FROM __drizzle_migrations').get();
      appliedCount = row?.count ?? 0;
    } catch {
      // Table doesn't exist — no migrations applied yet.
    }

    console.log(`Schema:   ${schema}\nDatabase: ${resolvedDb}\n`);
    for (const entry of journal.entries) {
      console.log(`  ${entry.idx < appliedCount ? '✓' : '○'} ${entry.tag}`);
    }
    console.log(`\n${appliedCount} applied, ${journal.entries.length - appliedCount} pending`);
    sqlite.close();
  },
});

await createCli({ defaultCommand: 'help' })
  .addCommand(generate)
  .addCommand(migrate)
  .addCommand(studio)
  .addCommand(status)
  .addHelp()
  .run();
