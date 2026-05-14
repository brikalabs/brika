# `apps/cli` — the new `brika` binary

## Scope

A new monorepo app that owns the `brika` command‑line experience end to
end. Replaces the CLI surface currently shipped from `apps/hub/src/cli.ts`.
The hub server (HTTP, runtime, supervisor) stays in `apps/hub`.

## Package shape

```
apps/cli/
  package.json
  tsconfig.json
  README.md
  src/
    main.ts                    # bin entry — parses --cwd, forwards to commands.ts
    commands.ts                # createCli() registration
    cli/
      command.ts               # local defineCommand re‑export (matches hub layout)
      hub-client.ts            # HTTP/SSE client (moved from apps/hub/src/cli/utils)
      sse.ts
      pid.ts
      errors.ts
    commands/
      start.ts
      stop.ts
      restart.ts
      status.ts
      log.ts
      open.ts
      auth/                    # subcommand group
      plugin/                  # subcommand group
      channel.ts
      update.ts
      uninstall.ts
      version.ts
      completions.ts
      dashboard.ts             # default: full TUI dashboard
    tui/
      App.tsx                  # router + provider wiring
      CliProvider.tsx          # CLI state (hub status, plugins, workflows, logs)
      useCli.ts
      routes.ts
      keys/
        useDashboardKeys.ts
      views/
        DashboardView.tsx
        PluginListView.tsx
        PluginDetailView.tsx
        WorkflowListView.tsx
        WorkflowDetailView.tsx
        LogTailView.tsx
        HelpView.tsx
        ShutdownView.tsx
      components/
        HubStatusCard.tsx
        PluginsCard.tsx
        WorkflowsCard.tsx
        LogPreviewCard.tsx
```

## `package.json`

```jsonc
{
  "name": "@brika/brika-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "bin": { "brika": "src/main.ts" },
  "scripts": {
    "dev": "bun --watch src/main.ts",
    "test": "bun test",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@brika/cli": "workspace:*",
    "@brika/tui": "workspace:*",
    "@brika/brix": "workspace:*",
    "ink": "^6.0.1",
    "picocolors": "^1.1.1",
    "react": "^19.2.3"
  },
  "devDependencies": {
    "@brika/testing": "workspace:*",
    "@types/bun": "^1.3.5",
    "@types/react": "^19.0.0"
  }
}
```

The hub‑client deps (`bcryptjs`, `hono`, etc.) are NOT pulled in — the CLI
only talks to a running hub over HTTP/SSE/PID file. That's a big cold‑start
win vs. the current `apps/hub` bin which loads `reflect-metadata` and the
entire runtime even for `brika status`.

## Entry & global flags

```ts
#!/usr/bin/env bun
// src/main.ts
function extractCwd(argv: string[]): string | undefined { /* same as today */ }

const cwd = extractCwd(process.argv);
if (cwd) process.env.BRIKA_HOME = cwd;

const { cli } = await import('./commands');
cli.run();
```

Same `--cwd` / `-C` global as the existing entry. No `reflect-metadata`,
no runtime imports. Each command lazily imports what it needs.

## Default command — TUI dashboard

Running `brika` with no args lands on the dashboard. Mockup in
[`mockups.md`](mockups.md). Behaviour:

1. Check `pid()` — if the hub isn't running, prompt: *“(•~•) hub is
   stopped — press s to start it, q to quit”*.
2. Otherwise mount `<DashboardView />` which polls `/api/status`,
   `/api/plugins`, `/api/workflows` and subscribes to `/api/stream/logs`.
3. Brix mood reflects state:
   - `loading` while polling first frame,
   - `idle` watching when ready,
   - `thinking` when an action is in flight,
   - `happy` after a successful action,
   - `error` if the hub stops responding mid‑session.

Keybinds: `tab`/`shift+tab` switch focused pane, `l` → log tail,
`p` → plugins, `w` → workflows, `?` → help, `q`/`Ctrl+C` → quit (does NOT
stop the hub — `brika stop` is the explicit kill).

## Command surface (1:1 with today's `brika`)

Each command lives in `src/commands/*.ts`. Where Brix can narrate
intermediate state, the handler does so via `brix.*` (one‑shot) or by
rendering a small Ink subtree (multi‑step). Functional behaviour matches
today.

| Command          | Today's location                              | New behaviour                                                                                          |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `start`          | `apps/hub/src/cli/commands/start.ts`          | Brix spinner during boot, transitions to `(^◡^)` once hub is healthy; `--foreground` opens the dashboard |
| `stop`           | same                                          | `brix.spinner('stopping…')` + final `(◕‿◕) stopped`                                                    |
| `restart`        | same                                          | spinner with two phases: stopping, starting                                                            |
| `status`         | same                                          | one‑line `(^◡^) running PID 1234` / `(-◡-) stopped`                                                    |
| `open`           | same                                          | unchanged copy, uses `@brika/tui/utils/browser`                                                        |
| `log`            | same                                          | `--follow` mounts `<LogTailView />` (full TUI); otherwise prints history as today                      |
| `auth …`         | `commands/auth/`                              | unchanged subcommands, Brix prefixes confirmations                                                     |
| `plugin …`       | `commands/plugin/`                            | `list` → `<PluginListView />`; rest stay one‑shot                                                      |
| `channel`        | same                                          | unchanged                                                                                              |
| `update`         | same                                          | spinner over current download progress                                                                 |
| `uninstall`      | same                                          | unchanged                                                                                              |
| `version`        | same                                          | Brix one‑liner with wordmark                                                                           |
| `completions`    | same                                          | unchanged                                                                                              |
| *(new)* `dashboard` | n/a                                        | explicit entry to the default TUI (so users can rebind from a wrapper)                                 |

## Hub client

The HTTP/SSE/PID helpers currently in `apps/hub/src/cli/utils/` move to
`apps/cli/src/cli/`. They are:

- `pid.ts` — read/check/write the brika PID file,
- `hub-client.ts` — `hubFetch(path)` + `requireRunningHub()`,
- `sse.ts` — `streamSseEvents<T>(res)`,
- `supervisor.ts` — `startBackground` + `runSupervisor`.

`supervisor.ts` is the one wrinkle: it currently `import('@/main')` to load
the in‑process hub server. The replacement spawns the hub binary instead
(`Bun.spawn(['brika', '_start-server', …])`), since the new CLI app no
longer carries the runtime. The hub keeps a `_start-server` hidden command
(or similar) that the CLI uses as its supervisor child. The exact mechanism
is open — see *Open questions* below.

## Default flow

```
$ brika
   ╭────────────────────────────────────────────╮
   │ (◕◡◕) Brika Runtime v0.1.0                │
   │ workspace: ~/projects/brika                │
   │ status: watching                           │
   ╰────────────────────────────────────────────╯

   (•◡•) watching workflows
$ brika start
   (•▁•) booting…
   (◔◡◔) loading plugins…
   (^◡^) hub ready · PID 1234
$ brika stop
   (•▁•) stopping…
   (◕‿◕) stopped
```

## Open questions

1. **CLI ↔ hub server boundary.** The supervisor that detaches the hub
   currently calls `import('@/main')` inside the same process. We have
   three options:

   - (a) Keep that import in `apps/hub` and re‑export from a tiny CLI shim
     under `apps/cli` (still bundles the runtime — kills the cold‑start
     win).
   - (b) Run the hub through its own bin: the CLI's `start` does
     `Bun.spawn(['brika-hub', …])`. Cleanest separation, requires shipping
     two bins.
   - (c) Embed the hub bin into the CLI bin via Bun's compile path. Hidden
     `brika _start-server` subcommand re‑execs into the runtime. One bin,
     no extra install step, slightly weirder layering.

   Recommendation: **(b)** for development, **(c)** for the compiled
   release artifact. Both share the same supervisor code path.

2. **Replace vs coexist.** See [`tasks.md`](tasks.md) #cutover.

3. **Authoritative source for plugin/workflow data in the TUI.** Today
   `brika log` reads `logs.db` directly via `Database`. The dashboard
   should not embed `bun:sqlite` (cold‑start cost). All TUI data comes
   over HTTP/SSE; if a view needs historical data the hub gets a new
   endpoint. Tracked as a follow‑up — initial dashboard works fine with
   live SSE only.
