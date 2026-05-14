# Architecture

## End‑state package graph

```
apps/cli            (@brika/brika-cli, bin: brika)
   │
   ├── @brika/cli           ← existing framework (createCli, defineCommand, runTui)
   ├── @brika/tui           ← NEW: generic TUI primitives + router (extracted from mortar)
   ├── @brika/brix          ← NEW: Brix mascot system (Brika‑branded)
   ├── @brika/hub-client    ← NEW (small): HTTP/SSE client for the hub
   │                          (lifted out of apps/hub/src/cli/utils/)
   └── ink, react           ← peer/runtime

packages/mortar     (@brika/mortar, bin: mortar)
   │
   ├── @brika/cli
   ├── @brika/tui           ← consumes the extracted package
   └── ink, react

packages/tui        (@brika/tui)
   │
   ├── components/    Kbd, Card, Spinner, ScreenChrome, MeasuredChrome,
   │                  LogPane, MainLayout (generic), Footer (generic shell)
   ├── keys/          useKey, key parser, useGlobalQuit factory
   ├── state/         useMeasure, useTerminalSize, useToast, useScroll,
   │                  useSearch, useFullscreen, useLayoutDimensions
   ├── utils/         ansi, browser, clipboard, saveLog, scroll, status
   └── router/        defineRoute, createRouter, Provider, Outlet, useRouter,
                      useRouterInstance, types

packages/brix       (@brika/brix)
   │
   ├── moods.ts            face glyph table (idle / happy / thinking / error / …)
   ├── animations.ts       frame sets (loading / thinking / breathing / talking /
   │                       sleep / panic / error / startup)
   ├── Brix.tsx            single‑glyph mascot component
   ├── BrixSay.tsx         speech bubble (top OR bottom orientation)
   ├── BrixHeader.tsx      full startup card with workspace summary
   ├── BrixStatusline.tsx  compact one‑line status with mood
   ├── BrixLog.ts          structured narrator: brix.info / .warn / .error / .think
   └── brand.ts            BRIKA_WORDMARK, TAGLINE, VERSION line
```

## Why these boundaries

- **`@brika/cli`** is a *framework* (parser, command definitions, `runTui`
  helper). It stays generic and unaware of Brika branding. Used by both
  mortar and brika‑cli.
- **`@brika/tui`** is a *primitive library*. It must not import anything
  Brika‑specific (no Brix glyphs, no hub types). That keeps it reusable for
  any future TUI in the monorepo.
- **`@brika/brix`** is the *brand layer*. Imports `@brika/tui` for the
  underlying `<Text>` / `<Box>` patterns and animation helpers, but adds
  Brika identity on top.
- **`apps/cli`** is the *product*. It composes the three above plus a hub
  client and the existing command surface.

## Why a new `apps/cli` instead of replacing `apps/hub`'s bin in place

`apps/hub` currently mixes two concerns:

- the **server** (`src/main.ts`, runtime, supervisor, IPC, HTTP),
- the **CLI** (`src/cli.ts`, `src/cli/*`) that drives it.

The CLI is what the end user types; the server is what runs after `start`.
Splitting them lets the CLI ship independently (smaller binary, faster cold
start, no `reflect-metadata` import on `brika status`) and frees us to
rewrite the CLI's UX without touching the server.

The server stays in `apps/hub`. The new `apps/cli` becomes the only place
that defines the `brika` bin, talking to the running hub over HTTP/SSE/IPC
exactly like today.

## Dependency direction

```
brika-cli ──► @brika/brix ──► @brika/tui ──► ink/react
        │                          ▲
        └───► @brika/cli ──────────┘ (runTui)

mortar ──► @brika/tui ──► ink/react
       └─► @brika/cli
```

No cycles. `@brika/brix` never imports `@brika/cli` (that would couple the
mascot to the command parser). `@brika/tui` never imports `@brika/brix`.

## Things that stay where they are

- `apps/hub/src/main.ts` and everything under `apps/hub/src/runtime/`,
  `apps/hub/src/cli/utils/{pid,hub-client,sse,supervisor}.ts` — server
  side. The CLI gains a thin `@brika/hub-client` that re‑exports the
  HTTP/SSE helpers (or we keep them inside apps/cli — see
  [`brika-cli.md`](brika-cli.md)).
- `packages/cli/src/*` (the framework) — unchanged.
- `packages/mortar/src/{supervisor,config,router}` — supervisor and config
  stay in mortar. Router moves to `@brika/tui` (it's purely generic).

## Naming notes

- The existing framework lib `@brika/cli` keeps its name. The new app uses
  `@brika/brika-cli` to avoid collision; the binary is still `brika`.
- `@brika/tui` is a deliberate non‑abbreviated name; `@brika/ink` would
  imply we're forking ink, which we aren't.
- `@brika/brix` matches the mascot. Alternative considered:
  `@brika/mascot`, rejected as too generic.
