# @brika/db

SQLite database layer for Brika. Provides typed schemas, automatic versioned migrations, WAL mode, and a global path resolver so every domain owns its own schema and migrations.

## Concepts

| Concept | What it does |
|---|---|
| `configureDatabases(dir)` | Sets the root data directory once at startup. All logical database names resolve to `<dir>/db/<name>`. |
| `defineDatabase(name, schema, migrations)` | Declares a database. `migrations` is a `MigrationMeta[]` produced at build time by the `loadMigrations` **macro** (see below). Returns a lazy opener. |
| `defineDatabase(...).open(path?)` | Opens (or creates) the SQLite file, runs pending migrations, and returns `{ db, sqlite, path }`. |

---

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
import { widgets } from './schema';

const migrations = loadMigrations('packages/widgets/src/migrations');

export const widgetsDb = defineDatabase('widgets.db', { widgets }, migrations);
```

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

You **never hand-write SQL**. Change `schema.ts`, then generate the diff:

```sh
brika-db generate --schema src/schema.ts
```

`drizzle-kit` diffs your new `schema.ts` against the most recent
`meta/<idx>_snapshot.json` (the *baseline*) and writes an incremental
`.sql` file (e.g. `ALTER TABLE … ADD COLUMN …`) plus a fresh snapshot,
and updates the journal.

**Commit the `.sql` file, the new `<idx>_snapshot.json`, and the updated
`_journal.json` together.** The snapshot is what makes the *next*
`generate` incremental — drop it and drizzle-kit re-emits the whole
schema. `brika-db doctor` fails CI if a baseline snapshot is missing.

> **Why generate works under Node.** `drizzle-kit` runs under plain Node,
> which has no `bun:sqlite`. `schema.ts` files therefore import their
> builders from the **`@brika/db/schema`** subpath (pure — no runtime),
> and the `@brika/db` barrel loads `bun:sqlite` / `drizzle-orm/bun-sqlite`
> lazily, so importing it never drags the Bun SQLite runtime into the Node
> tool. If you see `Cannot find module 'bun:sqlite'` from `generate`, a
> schema file is importing the runtime barrel instead of `@brika/db/schema`.

### Data migrations (transforms SQL can't express)

`generate` only emits *schema* DDL. For a data backfill or transform,
generate an empty migration and fill in the SQL by hand:

```sh
brika-db generate --schema src/schema.ts --custom
```

For filesystem / cross-file reshaping (not a single DB), use the
code-level `MigrationRunner` scopes in `apps/hub/src/runtime/migrations`
instead — that runner exists precisely for migrations SQL can't express.

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
  generate   Generate SQL migrations from schema changes
  migrate    Apply pending migrations to a database
  studio     Open a database browser UI
  status     Show applied / pending migrations
  doctor     Check every migrations folder for journal/SQL drift
  list       List database files in a data dir with size + migration status

Options:
  -s, --schema PATH   Path to a schema.ts file (required by generate/migrate/studio/status)
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
