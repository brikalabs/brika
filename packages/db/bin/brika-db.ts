#!/usr/bin/env bun
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CliError, createCli, defineCommand } from '@brika/cli';
import { inspectDatabaseFile, inspectMigrationsFolder } from '../src/inspect';

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
  if (!schema) {
    throw new CliError('--schema is required. Run brika-db help for usage.');
  }
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
  examples: ['brika-db migrate --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db'],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    await Bun.$`bunx drizzle-kit migrate --config=${SHARED_CONFIG}`.env(
      buildEnv(schema, out, values.db)
    );
  },
});

const studio = defineCommand({
  name: 'studio',
  description: 'Open a database browser UI',
  options: { schema: schemaOption, db: dbOption },
  examples: ['brika-db studio --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db'],
  async handler({ values }) {
    const { schema, out } = requireSchema(values.schema);
    await Bun.$`bunx drizzle-kit studio --config=${SHARED_CONFIG}`.env(
      buildEnv(schema, out, values.db)
    );
  },
});

const status = defineCommand({
  name: 'status',
  description: 'Show applied / pending migrations',
  options: { schema: schemaOption, db: dbOption },
  examples: ['brika-db status --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db'],
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
      for (const entry of journal.entries) {
        console.log(`  ○ ${entry.tag}`);
      }
      console.log(
        resolvedDb
          ? `\nDatabase not found at: ${resolvedDb}`
          : '\nTip: pass --db <path> to show applied status.'
      );
      return;
    }

    const { Database } = await import('bun:sqlite');
    const sqlite = new Database(resolvedDb, { readonly: true });
    let appliedCount = 0;

    try {
      const row = sqlite
        .query<{ count: number }, []>('SELECT COUNT(*) as count FROM __drizzle_migrations')
        .get();
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

const REPO_ROOT = resolve(import.meta.dir, '../../..');

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function findMigrationFolders(root: string): Promise<string[]> {
  const glob = new Bun.Glob('**/migrations/meta/_journal.json');
  const folders: string[] = [];
  for await (const rel of glob.scan({
    cwd: root,
    absolute: true,
    // Skip dependency trees — we only care about first-party migrations.
    onlyFiles: true,
  })) {
    if (rel.includes('node_modules')) {
      continue;
    }
    folders.push(dirname(dirname(rel)));
  }
  return folders.sort();
}

const doctor = defineCommand({
  name: 'doctor',
  description: 'Check every migrations folder for journal/SQL drift',
  examples: ['brika-db doctor'],
  async handler() {
    const folders = await findMigrationFolders(REPO_ROOT);
    if (folders.length === 0) {
      console.log('No migrations folders found.');
      return;
    }

    let problems = 0;
    let warnings = 0;
    for (const folder of folders) {
      const report = inspectMigrationsFolder(folder);
      const rel = folder.replace(`${REPO_ROOT}/`, '');
      const issues: string[] = [];
      for (const tag of report.orphanSql) {
        issues.push(`  ✗ orphan SQL (never runs): ${tag}.sql is not in _journal.json`);
        problems++;
      }
      for (const tag of report.missingSql) {
        issues.push(`  ✗ missing SQL: journal references ${tag} but ${tag}.sql is absent`);
        problems++;
      }
      for (const tag of report.missingSnapshots) {
        issues.push(`  ⚠ missing snapshot: meta/${tag}.json (degrades \`generate\`)`);
        warnings++;
      }

      const hasProblem = report.orphanSql.length > 0 || report.missingSql.length > 0;
      if (issues.length === 0) {
        console.log(`✓ ${rel} (${report.journalTags.length} migrations)`);
      } else {
        console.log(`${hasProblem ? '✗' : '⚠'} ${rel}`);
        for (const issue of issues) {
          console.log(issue);
        }
      }
    }

    console.log(
      `\n${problems} problem(s), ${warnings} warning(s) across ${folders.length} folder(s)`
    );
    if (problems > 0) {
      throw new CliError('Migration drift detected. Fix the issues above.');
    }
  },
});

const list = defineCommand({
  name: 'list',
  description: 'List every database file in a data dir with size + migration status',
  options: {
    dir: {
      type: 'string',
      description: 'Brika data dir (default: ~/.brika)',
    },
  },
  examples: ['brika-db list', 'brika-db list --dir /path/to/.brika'],
  handler({ values }) {
    const dataDir = values.dir ?? join(homedir(), '.brika');
    const dbDir = join(dataDir, 'db');
    if (!existsSync(dbDir)) {
      console.log(`No db directory at: ${dbDir}`);
      return Promise.resolve();
    }

    const files = readdirSync(dbDir)
      .filter((f) => f.endsWith('.db'))
      .sort();
    if (files.length === 0) {
      console.log(`No .db files in: ${dbDir}`);
      return Promise.resolve();
    }

    console.log(`Databases in ${dbDir}:\n`);
    for (const file of files) {
      const report = inspectDatabaseFile(join(dbDir, file));
      const total = formatBytes(report.sizeBytes + report.walBytes);
      console.log(`  ${file}  (${total}, ${report.appliedMigrations} migrations applied)`);
      for (const table of report.tables) {
        console.log(`    • ${table.name}: ${table.rows} rows`);
      }
    }
    return Promise.resolve();
  },
});

await createCli({ defaultCommand: 'help' })
  .addCommand(generate)
  .addCommand(migrate)
  .addCommand(studio)
  .addCommand(status)
  .addCommand(doctor)
  .addCommand(list)
  .addHelp()
  .run();
