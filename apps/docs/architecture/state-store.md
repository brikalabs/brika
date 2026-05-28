# State Store

Brika persists state in two layers:

* **Drizzle/SQLite** databases under `.brika/state/` for tables that benefit from query power (logs index, registry cache, settings, update history).
* **JSON files** under `.brika/state/` and `.brika/plugins/<uid>/data/` for state the hub serialises wholesale (board layouts, workflow definitions, brick instance configs, plugin storage).

Both are wrapped by services in `apps/hub/src/runtime/state/`.

## SQLite

`@brika/db` wraps Bun's `bun:sqlite` with Drizzle ORM. The hub opens databases with:

* `journal_mode=WAL` — concurrent readers, single writer.
* Aggressive PRAGMAs for performance (`synchronous=normal`, `cache_size`, `temp_store=memory`).
* A connection per database (the hub keeps a handful — logs DB, settings DB, etc.).

Schemas live alongside their owning services. A typical service:

```ts
@singleton()
class SettingsService {
  readonly #db = inject(Database);

  async get(key: string) { … }
  async set(key: string, value: unknown) { … }
}
```

The `Database` provider resolves the right file based on the workspace home (`BRIKA_HOME`).

## Migrations

Migrations are **content-addressed** — the migration file's body is hashed, and the migration table tracks which hashes have been applied. The implication:

* **Rename a migration file** without changing the body and nothing reruns.
* **Change the body** of an existing migration and it runs again on next boot.
* **Reorder migrations** and the order in the migration table records what actually ran, not the disk order.

This protects against the all-too-common bug of two devs creating different migrations with the same sequential ID. It does mean you can't edit a published migration without re-running it on every existing install — treat migration bodies as immutable once shipped.

Pending migrations are applied automatically on hub boot. The UI shows a banner if any migration is pending and the user can review before the hub applies them.

## JSON state files

Things that fit naturally in a single file:

* **Board layouts** — array of brick placements with per-instance configs.
* **Workflow definitions** — the block graph, connections, configs.
* **Brick instance configs** — keyed by board ID.
* **Per-plugin storage** — `.brika/plugins/<uid>/data/*.json` via the [Storage API](../plugins/storage.md).

These are read on demand and rewritten as a whole when they change. They're small enough that the simplicity is worth more than partial-update performance.

## Concurrency

* SQLite handles its own concurrency (WAL gives reader-writer concurrency).
* JSON files have no built-in concurrency control. The owning service serialises writes; cross-process modification (e.g., another hub starting in the same workspace) is rejected by the PID file before it gets that far.

## Backups

Back up `.brika/` and you have backed up the state. The SQLite WAL is checkpointed periodically; for hot backups, use `sqlite3 .brika/state/logs.db ".backup '...'"` while the hub is running (WAL allows concurrent reads).

For full disaster recovery, also export the OS keychain entries the hub uses (the file backend's `.brika/secrets.enc` is included in the directory by default). See [Secret Store](secret-store.md).

## Schema evolution

When adding a new field to a Drizzle schema:

1. Write a migration that adds the column with a sensible default.
2. Apply on next boot.

For JSON state, add fields with defaults at read time:

```ts
const config = JSON.parse(file) as Partial<MyConfig>;
const normalised: MyConfig = { ...defaults, ...config };
```

There is no separate migration system for JSON files. Defaults at read time is the convention.

## See also

* **[The .brika Directory](../basics/data-directory.md)** — file layout.
* **[Storage](../plugins/storage.md)** — plugin-side JSON.
* **[Secret Store](secret-store.md)** — encrypted secrets.
