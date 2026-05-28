# @brika/console

The `brika` operator console — the single binary users actually run.

`apps/console` bundles four things that ship as one executable:

- The **CLI surface** (`@brika/cli`) — commands like `brika start`, `brika plugin install`, `brika status`.
- The **Brix TUI dashboard** (`@brika/brix`, `@brika/tui`) — the animated terminal dashboard that streams hub events.
- An **inline hub server** (`@brika/hub`) — so `brika start` boots the runtime without a separate process.
- The **web UI bundle** — served by the hub at `http://localhost:3001`.

## Why a separate app?

The hub is the runtime; it can also run headless (see [`apps/build`](../build) which produces a `brika-hub` artifact). The console is the user-facing wrapper that decides whether to print to a terminal, attach a TUI, expose a CLI, or open a browser. Keeping it separate lets the headless hub stay small and lets the console evolve its UI without touching the runtime.

## Entry point

The binary is `bin: { brika: "src/main.ts" }`. In development:

```sh
bun run dev          # run via Bun directly
bun run dev:hot      # run under the @brika/tui hot-reload TUI
```

## Producing the binary

`apps/build` is the orchestrator that compiles `apps/console/src/main.ts` (plus the UI bundle and the bundled Bun runtime) into the single distributable `brika` binary published on GHCR and by the installer scripts.

## Related

- [`apps/hub`](../hub) — the runtime this app embeds.
- [`apps/ui`](../ui) — the web UI this app serves.
- [`apps/build`](../build) — produces the `brika` and `brika-hub` artifacts.
- [docs.brika.dev](https://docs.brika.dev) — full CLI reference and architecture.
