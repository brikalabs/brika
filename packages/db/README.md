# @brika/db

SQLite database layer for Brika. Provides typed schemas, automatic versioned migrations, WAL mode, and a global path resolver so every domain owns its own schema and migrations.

## Concepts

| Concept | What it does |
|---|---|
| `configureDatabases(dir)` | Sets the root data directory once at startup. All logical database names resolve to `<dir>/db/<name>`. |
| `defineDatabase(name, schema, import.meta)` | Declares a database. Captures the migrations folder path (`<module-dir>/migrations`) at module load time. Returns a lazy opener. |
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

Place `database.ts` next to `schema.ts`. Pass `import.meta` so the migrations folder resolves relative to this file — not the caller's location.

```ts
// src/database.ts
import { defineDatabase } from '@brika/db';
import { widgets } from './schema';

export const widgetsDb = defineDatabase('widgets.db', { widgets }, import.meta);
```

Migrations must live at `src/migrations/` (sibling of `database.ts`).

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

After changing `schema.ts`, generate the SQL diff:

```sh
brika-db generate --schema src/schema.ts
```

This writes a new `.sql` file to `src/migrations/` and updates its journal.

**Commit both the `.sql` file and the updated journal.** Never edit generated SQL by hand.

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

Options:
  -s, --schema PATH   Path to a schema.ts file (required)
  --db PATH           Path to the SQLite database file
  -h, --help          Show this help
```

---

## Exported query helpers

| Helper | Usage |
|---|---|
| `oneOrMany(col, value)` | `eq` for a scalar, `inArray` for an array, `undefined` if null/undefined |
| `cursorFilter(col, cursor, order)` | `< cursor` for desc, `> cursor` for asc — keyset pagination |
| `startTsFilter(col, ts)` | `>= ts` if defined |
| `endTsFilter(col, ts)` | `<= ts` if defined |

All standard SQL operators (`eq`, `and`, `asc`, `desc`, `inArray`, …) and schema builders (`sqliteTable`, `text`, `integer`, …) are re-exported from `@brika/db`.
