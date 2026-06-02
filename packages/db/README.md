# @brika/db

SQLite database layer for Brika. Provides typed schemas, automatic versioned migrations, WAL mode, and a global path resolver so every domain owns its own schema and migrations.

## Concepts

| Concept | What it does |
|---|---|
| `configureDatabases(dir)` | Sets the root data directory once at startup. All logical database names resolve to `<dir>/db/<name>`. |
| `defineDatabase(name, schema, migrations)` | Declares a database. `migrations` is a `MigrationMeta[]` produced at build time by the `loadMigrations` **macro** (see below). Returns a lazy opener. |
| `defineDatabase(...).open(path?)` | Opens (or creates) the SQLite file, runs pending migrations, and returns `{ db, sqlite, path }`. |

---

## Quickstart

Scaffold a database — `schema.ts`, `database.ts` (with the migrations path
baked in), and the first migration, all generated and ready to open:

```sh
brika-db new widgets --dir packages/widgets/src
```

Then add columns to `schema.ts` and run `brika-db generate`. The sections
below show what the scaffold produces.

## Usage

### 1. Define a schema

```ts
// src/schema.ts
import { integer, sqliteTable, text } from '@brika/db';

export const widgets = sqliteTable('widgets', {
  id:    integer('id').primaryKey({ autoIncrement: true }),
  name:  text('name').notNull(),
  score: integer('score').notNull().default(0),
});
```

### 2. Declare the database

Place `database.ts` next to `schema.ts`. Load the migrations with the
`loadMigrations` **macro** — `with { type: 'macro' }` runs it at *build
time*, so the SQL is inlined into the binary and there is no filesystem
read at runtime (critical for the single-binary distribution). Pass a
repo-relative path to the migrations folder.

```ts
// src/database.ts
import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import * as schema from './schema';

export const widgetsDb = defineDatabase(
  'widgets.db',
  schema,
  loadMigrations('packages/widgets/src/migrations')
);
```

`import * as schema` passes every table without re-listing them. The
`loadMigrations` path is repo-relative and checked at build time — a wrong
path fails the build (it can't be derived from the file's location because
Bun macro arguments must be static literals).

Migrations must live at `src/migrations/` (sibling of `database.ts`).
The macro reads `meta/_journal.json` — **a `.sql` file that is not listed
in the journal is silently ignored** (it never runs). Use `brika-db doctor`
to catch that class of drift.

### 3. Configure and open at startup

Call `configureDatabases` **once**, before any `.open()` call. In practice this happens in the bootstrap `start()` method before plugins run.

```ts
import { configureDatabases } from '@brika/db';
import { widgetsDb } from './database';

configureDatabases('/home/user/.brika');
// → file resolves to /home/user/.brika/db/widgets.db

const { db, sqlite } = widgetsDb.open();
// pending migrations run automatically on open
```

Pass an explicit path to override the logical name (useful for tests):

```ts
const { db } = widgetsDb.open(':memory:');
```

---

## Migrations

### Generating migrations

You **never hand-write SQL**. Change `schema.ts`, then run:

```sh
brika-db generate           # regenerate every database that changed
brika-db generate --schema packages/widgets/src/schema.ts   # just one
```

With no `--schema`, `brika-db generate` discovers every Drizzle schema in
the repo and regenerates each (unchanged ones are a no-op). For each it
diffs your `schema.ts` against the most recent `meta/<idx>_snapshot.json`
(the *baseline*) and writes an incremental `.sql` (e.g. `ALTER TABLE … ADD
COLUMN …`) plus a fresh snapshot, and updates the journal.

**Commit the `.sql` file, the new `<idx>_snapshot.json`, and the updated
`_journal.json` together.** The snapshot is what makes the *next*
`generate` incremental — drop it and drizzle-kit re-emits the whole
schema. `brika-db doctor` fails CI if a baseline snapshot is missing.

> **One import path.** Everything — table builders, query operators,
> `defineDatabase`, `defineMigration` — comes from `@brika/db`. The barrel
> stays loadable under `drizzle-kit` (plain Node, no `bun:sqlite`) because
> the package defers its `bun:sqlite` import to call time.

### TypeScript (code) migrations

`generate` only emits *schema* DDL. For a data backfill or transform that
SQL can't express, author a **TypeScript migration** with `defineMigration`
and register it alongside the SQL migrations:

```ts
// src/migrations/0002_backfill_scores.ts
import { defineMigration, isNull } from '@brika/db';
import { widgets } from '../schema';

export default defineMigration('0002_backfill_scores', ({ db, sqlite }) => {
  // `db` is the Drizzle handle; `sqlite` is the raw bun:sqlite connection.
  db.update(widgets).set({ score: 0 }).where(isNull(widgets.score)).run();
});
```

```ts
// src/database.ts
import { defineDatabase } from '@brika/db';
import { loadMigrations } from '@brika/db/macros' with { type: 'macro' };
import backfillScores from './migrations/0002_backfill_scores';
import { widgets } from './schema';

export const widgetsDb = defineDatabase('widgets.db', { widgets }, [
  ...loadMigrations('packages/widgets/src/migrations'),
  backfillScores,
]);
```

Migrations are a single ordered list keyed by **tag** (`NNNN_snake_name`).
SQL and code migrations **interleave by tag**, so a backfill can sit
between two schema migrations:

```
0001_add_score      (sql)   ALTER TABLE … ADD score
0002_backfill_score (code)  fill score for existing rows
0003_score_not_null (sql)   ALTER … score NOT NULL
```

Each migration runs in its **own transaction** together with the ledger
write, so a crash leaves the DB at a clean boundary. `run` must be
**synchronous** (bun:sqlite is synchronous), which keeps `.open()` sync.

> For *filesystem* / cross-file reshaping (not a single DB), use the
> code-level `MigrationRunner` scopes in `apps/hub/src/runtime/migrations`
> instead — that runner re-layouts on-disk state, which SQL can't express.

### The migration ledger

Applied migrations are tracked by tag in `__brika_migrations`. Installs
created before this ledger tracked SQL migrations by hash in Drizzle's
`__drizzle_migrations`; on first open the runner **seeds** the new ledger
from the old one (matching by stable hash), so an upgrade never re-runs an
already-applied migration.

### How migrations run at runtime

`.open()` runs all pending migrations synchronously before returning. Applied migrations are tracked in an internal table inside each SQLite file — no migration ever runs twice.

```
.open() called
  └─ resolveDatabasePath()   → /data-dir/db/widgets.db
  └─ mkdirSync(dirname, …)   → creates parent dirs if needed
  └─ new Database(path)      → opens or creates the file
  └─ SET PRAGMAs             → WAL, synchronous=NORMAL, foreign_keys, …
  └─ apply pending migrations → runs each pending .sql file in order
  └─ return { db, sqlite, path }
```

### Migrations across an app update

Migrations are **forward-only** and run lazily on `.open()` during a
binary's first boot — *after* the update has swapped the binary. The hub
makes that safe by pairing the databases with the binary backup:

```
update applies      → brika.previous (binary backup) created, binary swapped, restart
new binary boots    → db/ copied to db.previous BEFORE any .open() migrates  (db-backup.ts)
  ├─ onStart OK      → recordBootSuccess() drops brika.previous AND db.previous
  └─ onStart crashes → next boot restores db.previous over db while it swaps the
                       binary back — schema and binary roll back together
```

So a failed upgrade never leaves an old binary staring at a
newer-than-it-understands schema, and you don't have to write down
migrations. The snapshot is a one-time directory copy taken before any
handle is open, so it's point-in-time consistent. See
`apps/hub/src/runtime/updates/db-backup.ts`.

> Because the rollback discards everything the failed boot wrote, write
> migrations **expand-contract** where you can (add columns/tables in one
> release, stop reading the old shape in the next, drop it in a third) so
> a forward boot that *doesn't* crash stays compatible with the previous
> version too.

### Checking migration status

```sh
brika-db status --schema src/schema.ts --db ~/.brika/db/widgets.db
```

Output:

```
Schema:   /project/src/schema.ts
Database: /home/user/.brika/db/widgets.db

  ✓ 0000_init_widgets
  ○ 0001_add_score_index

1 applied, 1 pending
```

### Applying migrations manually (dev / CI)

```sh
brika-db migrate --schema src/schema.ts --db /path/to/widgets.db
```

### Browsing data

```sh
brika-db studio --schema src/schema.ts --db ~/.brika/db/widgets.db
```

---

## brika-db CLI reference

```
brika-db <command> [options]

Commands:
  new        Scaffold a new database (schema.ts + database.ts + first migration)
  generate   Generate SQL migrations from schema changes (all schemas if no --schema)
  migrate    Apply pending migrations to a database
  studio     Open a database browser UI
  status     Show applied / pending migrations
  doctor     Check every migrations folder for journal/SQL drift
  list       List database files in a data dir with size + migration status
  tui        Interactive dashboard of migrations + databases (r: refresh, q: quit)

Options:
  -s, --schema PATH   Path to a schema.ts file (generate auto-discovers all if omitted)
  --db PATH           Path to the SQLite database file
  --dir PATH          Brika data dir for `list` (default: ~/.brika)
  -h, --help          Show this help
```

### `brika-db doctor`

Scans every `*/migrations/` folder in the repo and reports drift between
`meta/_journal.json` and the `.sql` files on disk. Exits non-zero on a
**problem** (an orphan `.sql` not in the journal, or a journal entry with
no `.sql`); missing snapshots are reported as **warnings**. Run it in CI —
a `migrations-consistency.test.ts` asserts the same invariant.

### `brika-db list`

Shows every database file under `<data-dir>/db/`, its size (including the
`-wal`/`-shm` sidecars), how many migrations have been applied, and a row
count per table — a single view of all on-disk state:

```
Databases in /home/user/.brika/db:

  auth.db   (48.0 KB, 2 migrations applied)
    • users: 1 rows
    • sessions: 3 rows
  state.db  (32.0 KB, 2 migrations applied)
    • plugins: 6 rows
    • settings: 4 rows
    • custom_themes: 0 rows
```

### `brika-db tui`

An interactive terminal dashboard combining `doctor` (migration drift)
and `list` (database files) into one live board. Press `r` to refresh,
`q` to quit. In a non-TTY (CI, piped) it prints the board once and exits,
so it's safe to drop into scripts. The rendering is a pure function
(`renderDashboard`) over the inspection core, unit-tested to 100%.

---

## Architecture: why several databases, not one

Brika keeps **one SQLite file per domain** (`state.db`, `auth.db`,
`logs.db`, `sparks.db`, `cache.db`) rather than a single `brika.db`. This
is deliberate:

| Database | Why it's separate |
|---|---|
| `logs.db`, `sparks.db` | High-volume, append-only, retention-pruned. Isolating them keeps WAL churn and `VACUUM` cost off the small, latency-sensitive core tables. |
| `cache.db` | Disposable — can be deleted at any time to reclaim space without touching real state. |
| `auth.db` | Security-sensitive (password hashes, session tokens); gets `chmod 600` and a clean ownership boundary. |
| `state.db` | Core hub state (plugins, settings, themes). |

SQLite opens files lazily and cheaply, so the file count has no runtime
cost, and each domain owns its own independent migration history. The
trade-off is that you can't `JOIN` or run a transaction across domains —
which is the intended boundary. Add a new database when a domain has a
distinct lifecycle (retention, disposability, security); don't split a
domain that needs cross-table transactions.

---

## Exported query helpers

| Helper | Usage |
|---|---|
| `oneOrMany(col, value)` | `eq` for a scalar, `inArray` for an array, `undefined` if null/undefined |
| `cursorFilter(col, cursor, order)` | `< cursor` for desc, `> cursor` for asc — keyset pagination |
| `startTsFilter(col, ts)` | `>= ts` if defined |
| `endTsFilter(col, ts)` | `<= ts` if defined |

All standard SQL operators (`eq`, `and`, `asc`, `desc`, `inArray`, …) and schema builders (`sqliteTable`, `text`, `integer`, …) are re-exported from `@brika/db`.

## Package surface

| Entrypoint | For | Exposes |
|---|---|---|
| `@brika/db` | application code | builders, operators, `defineDatabase`, `defineMigration`, query helpers, types |
| `@brika/db/macros` | build-time (`with { type: 'macro' }`) | `loadMigrations` |
| `@brika/db/tooling` | the `brika-db` CLI / diagnostics | `inspectDatabaseFile`, `inspectMigrationsFolder`, `render*`, `applyMigrations`, `LEDGER_TABLE`, `sortMigrations` |

Diagnostics and migration-runner internals live in `@brika/db/tooling`,
not the main entrypoint, so defining a table autocompletes to builders and
`defineDatabase` — not `renderDashboard`.
