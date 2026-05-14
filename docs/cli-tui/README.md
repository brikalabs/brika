# Brika CLI / TUI — planning index

This folder contains the working plan for rebuilding the `brika` command‑line
experience as a first‑class TUI app, with **Brix** as its mascot.

## What we're building

1. **`@brika/tui`** — extract the generic TUI primitives, hooks, router, and
   utilities currently living inside `packages/mortar/src/tui` into a shared
   package. Mortar continues to own its supervisor + service views, but every
   reusable piece (router, `useKey`, `Card`, `Kbd`, `Spinner`,
   `MeasuredChrome`, `ScreenChrome`, `useTerminalSize`, `useToast`, search,
   scroll, ansi/clipboard/browser utils…) moves out.

2. **`@brika/brix`** — the Brix mascot system: expression set, animations,
   speech bubbles, header, statusline, and a small `brixLog` narrator. Brix
   is Brika‑branded (not generic), so it sits next to `@brika/tui` rather
   than inside it.

3. **`apps/cli`** (`@brika/brika-cli`, bin `brika`) — the new entry point for
   the `brika` binary. Replaces the CLI surface currently shipped from
   `apps/hub/src/cli.ts`. Renders a TUI dashboard by default; classic
   subcommands stay one‑shot but narrate via Brix.

## Why split mortar's TUI out

Mortar's TUI is already well‑factored: routes, key parser, measured chrome,
scroll/search/toast state, ansi helpers, clipboard, screen capture. None of
it is mortar‑specific — only `MortarProvider`, `ServiceList`,
`useFocusedService`, and the views that read a `Supervisor` are. The split
unlocks:

- the new Brika CLI without copy‑pasting hooks,
- future TUIs (e.g. a `brika-plugin dev` runner) without re‑deriving the
  same primitives,
- isolated tests for the primitives,
- a stable surface for plugin authors who want to build TUI tools on top.

## File map

- [`architecture.md`](architecture.md) — package layout & dependency graph.
- [`tui-package.md`](tui-package.md) — what moves out of mortar and how.
- [`brix.md`](brix.md) — Brix mascot package — components, moods, animations.
- [`brika-cli.md`](brika-cli.md) — new `apps/cli`: commands, views, hub wiring.
- [`mortar-migration.md`](mortar-migration.md) — the steps to make mortar
  consume `@brika/tui` without regressing.
- [`mockups.md`](mockups.md) — ASCII mockups for header, dashboard, drill‑down
  views, error/panic states.
- [`tasks.md`](tasks.md) — sequenced, checkable task list.

## Tagline

> Tiny blocks. Big automation.

## Brix in one paragraph

Brix is the tiny runtime creature that lives inside Brika. It narrates the
CLI's actions softly (`(◔◡◔) resolving blocks…`), reacts to runtime events,
holds the mood line in the status bar, and gives the terminal experience a
personality without ever sounding like a chatty AI assistant. Lowercase,
terse, observant, occasionally curious. See [`brix.md`](brix.md) for the full
mood set.
