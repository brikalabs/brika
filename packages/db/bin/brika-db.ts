#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { CliError, createCli, defineCommand } from '@brika/cli';
import {
  type DatabaseFileReport,
  databaseSource,
  deriveNames,
  formatBytes,
  inspectDatabaseFile,
  inspectMigrationsFolder,
  type MigrationFolderReport,
  renderDashboard,
  schemaSource,
} from '@brika/db/tooling';

const SHARED_CONFIG = resolve(import.meta.dir, '../database.config.ts');
const REPO_ROOT = resolve(import.meta.dir, '../../..');
// Use the pinned drizzle-kit (devDependency of @brika/db), not `bunx
// drizzle-kit`, which would fetch an incompatible @latest at runtime.
const DRIZZLE_KIT = resolve(import.meta.dir, '../node_modules/.bin/drizzle-kit');

const schemaOption = {
  type: 'string',
  short: 's',
  description: 'Path to a schema.ts file (omit to auto-discover every schema)',
} as const;

/**
 * Find every Drizzle schema in the repo — a `schema.ts` that builds tables
 * via `@brika/db`. Lets `brika-db generate`/`status` run with no `--schema`.
 */
async function discoverSchemas(root: string): Promise<string[]> {
  const glob = new Bun.Glob('**/schema.ts');
  const found: string[] = [];
  for await (const abs of glob.scan({ cwd: root, absolute: true })) {
    if (abs.includes('node_modules')) {
      continue;
    }
    const source = await Bun.file(abs).text();
    if (source.includes('sqliteTable(') && source.includes('@brika/db')) {
      found.push(abs);
    }
  }
  return found.sort((a, b) => a.localeCompare(b));
}

/** Schema paths to act on: the explicit `--schema`, or every discovered one. */
async function resolveSchemas(schema: string | undefined): Promise<string[]> {
  if (schema) {
    return [resolve(schema)];
  }
  const discovered = await discoverSchemas(REPO_ROOT);
  if (discovered.length === 0) {
    throw new CliError('No Drizzle schemas found. Pass --schema <path> explicitly.');
  }
  return discovered;
}

const rel = (abs: string) => abs.replace(`${REPO_ROOT}/`, '');

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

/**
 * Run a drizzle-kit subcommand for one schema. Always runs from the repo
 * root with `out` *relative* to it: drizzle-kit prefixes `out` with `./`,
 * which mangles an absolute path (`.//home/...`) but resolves a relative
 * one correctly regardless of the caller's cwd.
 */
async function runDrizzleKit(
  sub: 'generate' | 'migrate' | 'studio',
  schemaAbs: string,
  opts: { db?: string; custom?: boolean } = {}
): Promise<void> {
  const outAbs = join(dirname(schemaAbs), 'migrations');
  const env: typeof process.env = {
    ...process.env,
    BRIKA_SCHEMA: schemaAbs,
    BRIKA_OUT: relative(REPO_ROOT, outAbs),
    ...(opts.db ? { BRIKA_DB_URL: opts.db } : {}),
  };
  const extra = opts.custom ? ['--custom'] : [];
  await Bun.$`${DRIZZLE_KIT} ${sub} --config=${SHARED_CONFIG} ${extra}`.cwd(REPO_ROOT).env(env);
}

const generate = defineCommand({
  name: 'generate',
  description: 'Generate SQL migrations from schema changes',
  options: {
    schema: schemaOption,
    custom: {
      type: 'boolean',
      description: 'Emit an empty migration to hand-write a data migration',
    },
  },
  examples: [
    'brika-db generate',
    'brika-db generate --schema packages/auth/src/schema.ts',
    'brika-db generate --schema packages/auth/src/schema.ts --custom',
  ],
  async handler({ values }) {
    if (values.custom && !values.schema) {
      throw new CliError('--custom needs --schema <path> to target one database.');
    }
    const schemas = await resolveSchemas(values.schema);
    for (const schema of schemas) {
      if (schemas.length > 1) {
        console.log(`\n• ${rel(schema)}`);
      }
      await runDrizzleKit('generate', schema, { custom: values.custom });
    }
  },
});

const newDb = defineCommand({
  name: 'new',
  description: 'Scaffold a new database: schema.ts + database.ts + first migration',
  options: {
    dir: { type: 'string', description: 'Source dir to create files in (default: .)' },
  },
  examples: ['brika-db new widgets --dir packages/widgets/src'],
  async handler({ values, positionals }) {
    const raw = positionals[0];
    if (!raw) {
      throw new CliError('Usage: brika-db new <name> [--dir <path>]');
    }
    const names = deriveNamesOrThrow(raw);

    const dir = resolve(values.dir ?? '.');
    const schemaPath = join(dir, 'schema.ts');
    const databasePath = join(dir, 'database.ts');
    if (existsSync(schemaPath) || existsSync(databasePath)) {
      throw new CliError(`schema.ts or database.ts already exists in ${rel(dir)}.`);
    }

    const migrationsDir = join(dir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });
    await Bun.write(schemaPath, schemaSource(names.table));
    await Bun.write(databasePath, databaseSource(names, relative(REPO_ROOT, migrationsDir)));
    console.log(`✓ ${rel(schemaPath)}`);
    console.log(`✓ ${rel(databasePath)}`);

    // Generate the first migration so the macro has a journal to read.
    await runDrizzleKit('generate', schemaPath);
    console.log(
      `\nNext: call configureDatabases() at boot, then \`${names.binding}.open()\` in your store.`
    );
  },
});

function deriveNamesOrThrow(raw: string): ReturnType<typeof deriveNames> {
  try {
    return deriveNames(raw);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}

const migrate = defineCommand({
  name: 'migrate',
  description: 'Apply pending migrations to a database',
  options: { schema: schemaOption, db: dbOption },
  examples: ['brika-db migrate --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db'],
  async handler({ values }) {
    const { schema } = requireSchema(values.schema);
    await runDrizzleKit('migrate', schema, { db: values.db });
  },
});

const studio = defineCommand({
  name: 'studio',
  description: 'Open a database browser UI',
  options: { schema: schemaOption, db: dbOption },
  examples: ['brika-db studio --schema packages/auth/src/schema.ts --db ~/.brika/db/auth.db'],
  async handler({ values }) {
    const { schema } = requireSchema(values.schema);
    await runDrizzleKit('studio', schema, { db: values.db });
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

async function findMigrationFolders(root: string): Promise<string[]> {
  const glob = new Bun.Glob('**/migrations/meta/_journal.json');
  const folders: string[] = [];
  for await (const abs of glob.scan({
    cwd: root,
    absolute: true,
    // Skip dependency trees — we only care about first-party migrations.
    onlyFiles: true,
  })) {
    if (abs.includes('node_modules')) {
      continue;
    }
    folders.push(dirname(dirname(abs)));
  }
  return folders.sort((a, b) => a.localeCompare(b));
}

interface FolderDrift {
  readonly rel: string;
  readonly issues: readonly string[];
  readonly problems: number;
  readonly warnings: number;
  readonly hasProblem: boolean;
  readonly migrations: number;
}

/** Build the drift report (issue lines + counts) for one migrations folder. */
function describeFolderDrift(folder: string): FolderDrift {
  const report = inspectMigrationsFolder(folder);
  const issues: string[] = [];
  for (const tag of report.orphanSql) {
    issues.push(`  ✗ orphan SQL (never runs): ${tag}.sql is not in _journal.json`);
  }
  for (const tag of report.missingSql) {
    issues.push(`  ✗ missing SQL: journal references ${tag} but ${tag}.sql is absent`);
  }
  if (report.baselineSnapshotMissing) {
    issues.push(
      `  ⚠ missing baseline snapshot: meta/${report.journalTags.at(-1)}.json — \`generate\` can't diff incrementally`
    );
  }
  const problems = report.orphanSql.length + report.missingSql.length;
  return {
    rel: folder.replace(`${REPO_ROOT}/`, ''),
    issues,
    problems,
    warnings: report.baselineSnapshotMissing ? 1 : 0,
    hasProblem: problems > 0,
    migrations: report.journalTags.length,
  };
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
      const drift = describeFolderDrift(folder);
      problems += drift.problems;
      warnings += drift.warnings;
      if (drift.issues.length === 0) {
        console.log(`✓ ${drift.rel} (${drift.migrations} migrations)`);
        continue;
      }
      console.log(`${drift.hasProblem ? '✗' : '⚠'} ${drift.rel}`);
      for (const issue of drift.issues) {
        console.log(issue);
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
      .sort((a, b) => a.localeCompare(b));
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

/** Collect the data the dashboard renders: migration drift + db files. */
async function collectDashboard(dataDir: string): Promise<{
  migrations: MigrationFolderReport[];
  databases: DatabaseFileReport[];
}> {
  const folders = await findMigrationFolders(REPO_ROOT);
  const migrations = folders.map((folder) => inspectMigrationsFolder(folder));

  const dbDir = join(dataDir, 'db');
  const databases = existsSync(dbDir)
    ? readdirSync(dbDir)
        .filter((f) => f.endsWith('.db'))
        .sort((a, b) => a.localeCompare(b))
        .map((f) => inspectDatabaseFile(join(dbDir, f)))
    : [];

  return { migrations, databases };
}

const ESC = '\u001b';
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const CLEAR = `${ESC}[2J${ESC}[H`;

const tui = defineCommand({
  name: 'tui',
  description: 'Interactive dashboard of migrations + databases (r: refresh, q: quit)',
  options: { dir: { type: 'string', description: 'Brika data dir (default: ~/.brika)' } },
  examples: ['brika-db tui', 'brika-db tui --dir /path/to/.brika'],
  async handler({ values }) {
    const dataDir = values.dir ?? join(homedir(), '.brika');

    const draw = async () => {
      const data = await collectDashboard(dataDir);
      process.stdout.write(CLEAR + renderDashboard(data) + '\n\n[r] refresh   [q] quit\n');
    };

    const stdin = process.stdin;
    const interactive = Boolean(stdin.isTTY) && typeof stdin.setRawMode === 'function';
    if (!interactive) {
      // Non-TTY (CI, piped): print once and exit.
      const data = await collectDashboard(dataDir);
      console.log(renderDashboard(data));
      return;
    }

    process.stdout.write(ALT_SCREEN_ON);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    await draw();

    await new Promise<void>((resolvePromise) => {
      const onKey = (key: string) => {
        if (key === 'q' || key === '\u0003') {
          stdin.off('data', onKey);
          resolvePromise();
        } else if (key === 'r') {
          draw().catch(() => {
            /* a transient render failure shouldn't kill the loop */
          });
        }
      };
      stdin.on('data', onKey);
    });

    stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write(ALT_SCREEN_OFF);
  },
});

await createCli({ defaultCommand: 'help' })
  .addCommand(newDb)
  .addCommand(generate)
  .addCommand(migrate)
  .addCommand(studio)
  .addCommand(status)
  .addCommand(doctor)
  .addCommand(list)
  .addCommand(tui)
  .addHelp()
  .run();
