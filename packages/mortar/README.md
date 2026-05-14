# mortar

**Bind your local dev services together while they bake.**

`mortar` is a single-command local-dev orchestrator. Define your stack
in one YAML file; mortar spawns each service in dependency order, gates
startups on healthchecks, multiplexes their colored output into a TUI
you can navigate, and tears down the entire process tree on Ctrl+C.

Think of it as `docker compose up` for processes that aren't in
containers — Vite dev servers, Bun watchers, wrangler, etc.

The system is generic: any repo with multiple long-running dev
processes can adopt it. Ships in the Brika monorepo because that's
where it was born, but nothing in the package depends on Brika — copy
it elsewhere if you like.

---

## Quick start

```bash
# 1. Drop a starter mortar.yml at the repo root
mortar init

# 2. Edit it for your services
$EDITOR mortar.yml

# 3. Bring everything up
mortar
```

If you run `mortar` in a repo with no config, step 2 happens for you —
mortar writes the default file and tells you where it landed.

`mortar` walks up from your current directory to find `mortar.yml`
(vite-style), so it works from anywhere inside the repo. Use
`mortar start --config <path>` (or `-c <path>`) to point at a specific
file.

---

## The config file

```yaml
services:
  <id>:                              # arbitrary identifier
    label: Human label               # shown in the TUI
    command: bun run dev             # spawned; basic "..." / '...' quoting supported
    cwd: ./apps/api                  # optional; relative to mortar.yml
    port: 3000                       # ← declare the port, recommended
    env:                             # optional; merged on top of process.env
      DEBUG: "true"
    dependsOn: [other-id, ...]       # optional; waits for those to be healthy
    health:                          # optional; defaults derived from `port:`
      kind: auto | tcp | http | none
      port: 3000                     # when kind: tcp
      url: http://localhost:3000/healthz   # when kind: http
      timeoutMs: 15000
    url: http://localhost:3000/?foo  # optional override (deep links, query strings)
```

### Declared `port:` vs. auto-detection

Two ways to tell mortar where a service listens — pick whichever fits:

1. **Declared (recommended)** — add `port: 3000` to the service. mortar
   uses it for everything: TCP-probe health, browser URL, and the
   value shown in the TUI. Zero guesswork.
2. **`health: auto`** — when you don't set `port:`, mortar tries to
   discover the port at runtime. Two heuristics in parallel:
   - **PID-tree probe** (lsof + pgrep): walk the spawned child's
     process tree and ask which TCP ports they own.
   - **Log-line parser**: each output line is scanned for patterns
     like `http://localhost:5173`, `listening on port 3000`, etc.
     When a match is found, mortar verifies the port is actually
     bound (`lsof -iTCP:port`) before accepting it.

   Whichever succeeds first wins. Both are best-effort — if your
   wrapper re-execs (e.g. `bun run dev` → `bun --watch`) or the
   service doesn't print its port to stdout, declared `port:` is the
   reliable answer.

### Healthchecks

A service stays in `starting` until its healthcheck passes. Downstream
services (anything listing this id in `dependsOn`) stay in `pending`
until then.

| `kind`  | Behavior                                                                          |
| ------- | --------------------------------------------------------------------------------- |
| `tcp` (default when `port:` is set) | Opens a TCP connection to `127.0.0.1:port` until it's accepted. |
| `auto` (default when no `port:`)    | PID-tree probe + log-line port parser; first match wins.        |
| `http`  | Polls `url` until a 2xx arrives, or `timeoutMs` elapses.                          |
| `none`  | Healthy as soon as the process spawns.                                            |

### Per-service URL

Each service exposes a browser URL the TUI opens with `o`. Resolution
order:

1. Explicit `url:` in the YAML (deep links / query strings)
2. `port:` declared on the service → `http://localhost:<port>/`
3. Auto-detected port (from `health: auto`)
4. Static port from `health: tcp` / origin of `health: http`
5. `null` (no URL — `o` is a no-op)

### Validation

Hand-rolled with path-aware errors. Cycles in `dependsOn` are detected
up front so the supervisor can assume a DAG.

```
services.hub.health.port: must be a port in [1, 65535]
services.hub.dependsOn: unknown service "ghst"
services.ui.dependsOn: cannot depend on itself
services.a.dependsOn: dependency cycle detected: a → b → c → a
```

---

## CLI reference

```
mortar [<command>] [options]
```

| Command            | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `start` (default)  | Resolve `mortar.yml` and bring the stack up.                 |
| `init`             | Write the default `mortar.yml` in the current directory.     |
| `help [<cmd>]`     | Show help (global or per-command).                           |

### `start` flags

| Flag                  | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `-c, --config <path>` | Use a specific `mortar.yml` instead of walking up from cwd.                |
| `--no-tui`            | Plain interleaved `[svc]` log mode. Use in CI / when piping output.        |
| `-h, --help`          | Per-command help.                                                          |

---

## The TUI

```
┌────────────────────┐┌──────────────────────────────────────────────┐
│ Services           ││ Signaling (Bun) · healthy · live · 47 lines  │
│                    ││                                              │
│ ▸ ● Signaling (Bun)││ [signaling] listening on http://localhost:…  │
│   ● UI (Vite)      ││ [signaling] tickets db ready                 │
│   ● Bootstrap      ││ [signaling] hub channel open                 │
│   ● Hub            ││ ...                                          │
│   ● Terminal       ││                                              │
└────────────────────┘└──────────────────────────────────────────────┘
 → http://localhost:8787/   [o] open
 [tab] switch  [r] restart  [/] search  [d] deps  [?] help  [q] quit
 mortar v0.3.1 · built by the Brika Labs team
```

### Keybinds

Press `?` from anywhere to see the full reference in the TUI.

| Key                | Action                                                  |
| ------------------ | ------------------------------------------------------- |
| `tab` / `shift+tab`| Cycle focused service                                   |
| `↑` / `↓`          | Scroll log one line · `shift+` scrolls 10               |
| `PgUp` / `PgDn`    | Scroll half a page                                      |
| `g` / `G`          | Top of buffer / live tail                               |
| `f`                | Toggle fullscreen (hide service list)                   |
| `/`                | Open search prompt                                      |
| `n` / `N`          | Next / previous match                                   |
| `Esc`              | Cancel prompt · clear active search                     |
| `r`                | Restart focused service                                 |
| `o`                | Open focused service's URL in the browser               |
| `i`                | Forward keystrokes to focused service stdin             |
| `s`                | Save focused service logs to `.mortar-logs/`            |
| `c`                | Copy focused service logs to clipboard                  |
| `?`                | Toggle help screen                                      |
| `d`                | Toggle dependency-graph view                            |
| `q` / `Ctrl+C`     | Quit (graceful, 3s grace, then SIGKILL). Works anywhere.|

Status dots: ◌ pending · ◐ starting · ● healthy · ✘ crashed.

### Views

- **Main** — service list (left) + log pane (right) + footer.
- **Help** (`?`) — full keybind reference, grouped by section.
- **Dependencies** (`d`) — topological layers showing startup order,
  with detected URL / crash reason inline per service.
- **Input** (`i`) — forwards every keystroke (and `Ctrl+C` as `^C`
  byte) to the focused service's stdin. Esc exits back to main.
- **Shutdown** — animated overlay during teardown; per-service rows
  flip from spinner → ✓ as each child exits.

### Search

- `/foo<Enter>` highlights every line containing `foo` (case-insensitive).
- `n` / `N` cycle through matches; the current match gets a `▶` gutter.
- `Esc` clears the active search and returns to live-tail.
- Search is **per-tab** — switching service tabs clears the search.

### Shutdown

`q` or `Ctrl+C` enters a shutdown overlay that:

1. Animates a spinner so you know it's working, not frozen.
2. Sends SIGTERM to every running child, then SIGKILL anything still
   alive after a 3s grace.
3. Kills the **entire process tree** — `bun --watch` / `bun --filter`
   spawn sub-processes that would otherwise be orphaned. mortar walks
   the descendant tree (`pgrep -P`) AND kills the whole process group
   (`kill -pgid`), so nothing leaks.

A second `Ctrl+C` during the overlay force-exits immediately.

### Colors

`FORCE_COLOR=1` is set on every spawned child so chalk / picocolors /
vite / etc. emit ANSI through their (piped) stdout. ink renders the
codes — vite's banner stays cyan, errors stay red, etc. Override per
service via `env:` if needed.

---

## How it works

```
                ┌─────────────────┐
                │  mortar binary  │  (CLI — argv, --help, errors)
                └────────┬────────┘
                         │
              ┌──────────▼──────────┐
              │   findConfig walks  │
              │   up from cwd       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   validateConfig    │  (typed errors, cycle detection)
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐    ┌────────────────────────┐
              │     Supervisor      │◄───│  per-service           │
              │  - DAG scheduler    │    │  Bun.spawn             │
              │  - health gating    │───▶│  detached + own pgid   │
              │  - ring buffers     │    │  stdout/stderr piped   │
              │  - log-port parser  │    └────────────────────────┘
              │  - tree teardown    │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  TUI (ink + React)  │  or `--no-tui` plain mode
              │  declarative router │
              │  flex-height views  │
              └─────────────────────┘
```

### Source layout

```
src/
  cli.ts              entry; routes to start / init / help
  constants.ts        tunables (ring-buffer size, grace periods, …)
  errors.ts           typed errors
  brand.ts            version + attribution

  config/             schema, loader, validator
    types.ts          ServiceSpec, MortarConfig, HealthCheck
    defaults.ts       default mortar.yml template
    load.ts           findConfig, loadConfig, save…
    validate.ts       hand-rolled parser + cycle detection
    graph.ts          topologicalLayers (for the deps view)
    url.ts            serviceUrl()
    prompts.ts        first-run wizard

  supervisor/         process lifecycle
    Supervisor.ts     coordinator: DAG scheduler, event bus
    lifecycle.ts      spawn / health-probe / terminate primitives
    health.ts         TCP + HTTP wait helpers
    port-detect.ts    PID-tree port probe
    log-port-parser.ts  log-line port parser
    command-parser.ts shell-style argv splitter
    kill-tree.ts      SIGTERM/SIGKILL the whole tree
    stream-reader.ts  ANSI-aware line reader

  router/             tiny TanStack-style router for the TUI

  tui/
    App.tsx           composition root
    MortarProvider.tsx  shared state context
    routes.ts         route table
    state/            useScroll, useSearch, useToast, …
    keys/             useKey + per-screen keybind bundles
    views/            MainView, HelpView, DependencyView, InputView, ShutdownView
    components/       ServiceList, LogPane, Footer, Card, Kbd, Spinner, …
    utils/            status formatting, clipboard, browser, …
```

### Notable design choices

- **Process group teardown.** Children are spawned with `detached: true`
  so each child is the leader of its own process group. Shutdown does
  `kill(-pgid, SIGTERM)` *and* walks descendants via `pgrep -P`,
  belt-and-braces, so grandchildren of wrappers (`bun --filter X dev`
  → real server) can't survive Ctrl+C.
- **No `crashed` flicker during shutdown.** When a child exits while
  the supervisor is shutting down, its status stays as-is rather than
  flipping to `crashed`. The shutdown overlay tracks a separate
  `terminated` flag per service.
- **Log-line port parser.** Many dev tools announce their port to
  stdout. A small ordered set of regexes catches `http://host:PORT`,
  `listening on PORT`, `port: PORT`, etc.; the detected port is
  verified with `lsof` before being trusted.
- **Flex-height TUI.** Views measure their footer/chrome with ink's
  `measureElement`, push the height through context, and the log pane
  uses `flexGrow={1}` so it always fills the remaining terminal rows.
- **Declarative router.** Every screen is a `<Route>` with its own
  component and keybinds; `<Outlet />` renders the active one. No
  switch statements, no global keybind dispatcher.

---

## Limitations / non-goals

- **No quoting in `command`** beyond `"..."` / `'...'` grouping — use
  a shim script for pipes, redirections, subshells.
- **No file watching** — services restart only on `r`. HMR is the
  service's responsibility.
- **No detached / daemon mode** — mortar is foreground. For background
  processes use a system supervisor (launchd, systemd).
- **No log persistence** — the ring buffer is in-memory, 10 000 lines
  per service. Use `s` to save a snapshot, or pipe `--no-tui` to a
  file for durable logs.
- **`health: auto` needs `lsof` + `pgrep`** — preinstalled on macOS
  and every common Linux distro. Declared `port:` doesn't need either.

---

## Development

```bash
bun --filter @brika/mortar typecheck
bun --filter @brika/mortar test
```

Tests use **real subprocesses** for the supervisor (`bun -e "..."`
workers) — mocking the lifecycle is more brittle than spawning
sub-second real ones. The full suite runs in under a minute.
