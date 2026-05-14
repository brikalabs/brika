# Mortar migration plan

Goal: make mortar consume `@brika/tui` for every primitive that moved out
of it, without any regression in mortar's UX or test suite.

## Pre‑flight

- `bun --filter @brika/mortar test` is green on `main`.
- `bun --filter @brika/mortar typecheck` is green.
- Mortar visual smoke test: `bun run packages/mortar/src/cli.ts` boots
  the TUI, services render, `?` opens help, `q` quits cleanly.

## Sequence

The extraction is intentionally mechanical. Do it in one PR per step so the
diff stays reviewable.

### 1. Scaffold `@brika/tui` package

Empty `packages/tui/` with `package.json`, `tsconfig.json`, and `src/index.ts`
exporting nothing. Add workspace dep. `bun install` must succeed; nothing
imports it yet.

### 2. Move the router

The router has no mortar coupling. Move `packages/mortar/src/router/*`
verbatim to `packages/tui/src/router/`. Update imports inside the moved
files (relative paths to `../router/types` etc. stay relative). Re‑export
from `@brika/tui`.

Inside mortar, replace every `from '../router'` / `from '../../router'`
with `from '@brika/tui'` (or `@brika/tui/router`). `bun --filter
@brika/mortar test` should still pass — the router tests come along.

### 3. Move generic utils

`tui/utils/{ansi,browser,clipboard,saveLog,scroll,status}.ts` and their
`.test.ts` siblings move to `packages/tui/src/utils/`. Update mortar
imports.

### 4. Move generic state hooks

`useTerminalSize`, `useMeasure`, `useToast`, `useFullscreen`, `useScroll`,
`useSearch`, `useLayoutDimensions` move to `packages/tui/src/state/`. These
hooks return plain objects — no context coupling — so the move is a copy +
import update.

### 5. Move generic keys

`useKey`, `keyToBytes`, `useNavigationKeys`, `useScrollKeys`,
`useSearchInput` move to `packages/tui/src/keys/`. Tests come with them.

`useGlobalQuit` is split: a generic `useGlobalQuit({ onQuit, enabled })`
lives in `@brika/tui`; mortar keeps a thin
`useMortarGlobalQuit` that derives `enabled` from mortar's router + search
state and delegates.

### 6. Introduce `<TuiShellProvider>`

Add `packages/tui/src/shell/TuiShellProvider.tsx` with the minimal context
described in [`tui-package.md`](tui-package.md) (chromeHeight, setChromeHeight,
onQuit). `MeasuredChrome` (moved next step) and the generic `useGlobalQuit`
read from this context.

### 7. Move generic components

`Kbd`, `Card`, `Spinner`, `MeasuredChrome`, `ScreenChrome` (refactored to
accept wordmark/brand as props), `LogPane` (refactored to accept
`lines/searchQuery/currentMatchLine` rather than a `ServiceState`), and a
generic `SplitMainLayout` (the flex skeleton currently inside
`MainLayout.tsx`) all move to `packages/tui/src/components/`.

Mortar:

- `MortarProvider` becomes:
  ```tsx
  <TuiShellProvider onQuit={onQuit}>
    <MortarStateProvider supervisor={…}>{children}</MortarStateProvider>
  </TuiShellProvider>
  ```
  `MortarStateProvider` is what `useMortar()` reads (everything except
  chromeHeight/onQuit, which now come from `useTuiShell()`).
- `ScreenChrome` calls inside mortar pass `wordmark={MORTAR_WORDMARK}` and
  `brand={BRAND_LINE}`.
- `LogPane` callers pass `lines={focused.logs}` instead of `service={focused}`.
- `MainView.tsx` and `InputView.tsx` rewrap with the generic
  `SplitMainLayout` and supply the mortar‑specific sidebar/footer/url
  pieces.

### 8. Cleanup

Delete the now‑empty `packages/mortar/src/router/` and
`packages/mortar/src/tui/{utils,state,keys,components}/*` files that have
been moved. `packages/mortar/src/tui/` should now only contain:

- `App.tsx`
- `MortarProvider.tsx` (renamed `MortarStateProvider` if we go that way)
- `useMortar.ts`
- `routes.ts`
- `views/*` (mortar‑specific)
- `state/{useFocusedService,useSupervisorTick,useShutdownBridge}.ts`
- `keys/{useMainKeybinds,useServiceActionKeys}.ts`
- `components/{ServiceList,MortarFooter}.tsx`

### 9. Verify

- `bun --filter @brika/tui test` green.
- `bun --filter @brika/mortar test` green.
- `bun --filter @brika/mortar typecheck` green.
- Visual smoke test: mortar boots, behaves identically.

## Risk hotspots

- **Context provider ordering.** `MortarProvider` originally bundles
  shutdownBridge inside the same render. After the split,
  `<TuiShellProvider>` must wrap `<MortarStateProvider>` and the
  `useShutdownBridge` hook still needs `useRouter()` — so `<RouterProvider>`
  must wrap both. Mortar's `App.tsx` already nests `RouterProvider` around
  `MortarProvider`; just keep that order.
- **`setChromeHeight` stability.** Today the stable callback identity is
  produced by mortar. Move that `useCallback(...)` into `TuiShellProvider`
  to keep `MeasuredChrome`'s effect from re‑firing.
- **Tests that import from relative paths inside mortar.** A grep + sed
  pass over `packages/mortar/src/**/*.test.ts` catches them; do it after
  each move step so a single failed import doesn't snowball.
