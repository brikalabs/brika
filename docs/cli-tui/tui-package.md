# `@brika/tui` — extraction plan

The goal of this package is to be the **generic** Ink layer the rest of the
monorepo can build TUIs on. Nothing here should know about mortar's
supervisor, the Brika hub, the Brix mascot, or any branded copy. Anything
brand‑shaped lives in `@brika/brix`.

## What moves out of mortar

Source paths refer to `packages/mortar/src/`.

### 1. Components (`mortar/src/tui/components`)

| File                | Move to `@brika/tui` | Notes                                                                                                                          |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Kbd.tsx`           | yes                  | already generic                                                                                                                |
| `Card.tsx`          | yes                  | already generic                                                                                                                |
| `Spinner.tsx`       | yes                  | already generic                                                                                                                |
| `MeasuredChrome.tsx`| yes                  | requires a tiny adaptation — see *Provider abstraction* below                                                                  |
| `ScreenChrome.tsx`  | yes (refactored)     | currently imports `BRAND_LINE` + `MORTAR_WORDMARK` from `brand.ts` — accept those as props instead                             |
| `LogPane.tsx`       | yes                  | takes a `service`‑shaped prop today; refactor to accept a `lines: string[]` + `currentMatchLine?: number` + `searchQuery?` shape |
| `Footer.tsx`        | split                | the generic scaffolding (search line, toast line, keybinds line) becomes a generic `<Footer>` in `@brika/tui`. The URL bar + mortar‑specific keybind copy stays in mortar (`mortar/src/tui/components/MortarFooter.tsx`)|
| `ServiceList.tsx`   | stay in mortar       | reads `ServiceState[]` from supervisor                                                                                         |
| `MainLayout.tsx`    | split                | extract a generic `<SplitMainLayout sidebar=… content=… chrome=…/>` to `@brika/tui`; mortar gets a thin wrapper that supplies the supervisor‑specific bits |

### 2. Keys (`mortar/src/tui/keys`)

| File                       | Move? | Notes                                                                                  |
| -------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `useKey.ts` + `.test.ts`   | yes   | already generic; tests come with it                                                    |
| `keyToBytes.ts` + `.test.ts` | yes | already generic                                                                        |
| `useGlobalQuit.ts`         | factory | reads mortar's `useMortar()`. Replace with a generic `useGlobalQuit({ onQuit, enabled })` in `@brika/tui`; mortar's old hook becomes a one‑liner calling the generic version |
| `useScrollKeys.ts`         | yes   | scroll bindings are generic                                                            |
| `useSearchInput.ts`        | yes   | text input handling is generic                                                         |
| `useNavigationKeys.ts`     | yes   | up/down/tab/shift+tab is generic                                                       |
| `useMainKeybinds.ts`       | stay  | dispatches mortar actions (restart service, open URL); keeps its mortar coupling       |
| `useServiceActionKeys.ts`  | stay  | mortar‑specific (r/k/o)                                                                |

### 3. State hooks (`mortar/src/tui/state`)

| File                       | Move? | Notes                                                                                              |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `useTerminalSize.ts`       | yes   | generic                                                                                            |
| `useMeasure.ts`            | yes   | generic                                                                                            |
| `useToast.ts`              | yes   | generic                                                                                            |
| `useFullscreen.ts`         | yes   | generic                                                                                            |
| `useScroll.ts`             | yes   | generic                                                                                            |
| `useSearch.ts`             | yes   | takes `lines: string[]` and a key — already generic enough                                         |
| `useLayoutDimensions.ts`   | yes   | takes `(logsLength, chromeHeight)` — generic                                                       |
| `useFocusedService.ts`     | stay  | reads `ServiceState[]`                                                                             |
| `useSupervisorTick.ts`     | stay  | mortar supervisor                                                                                  |
| `useShutdownBridge.ts`     | stay  | mortar supervisor                                                                                  |

### 4. Utilities (`mortar/src/tui/utils`)

All of these (`ansi`, `browser`, `clipboard`, `saveLog`, `scroll`, `status`)
are pure functions. They all move into `@brika/tui/utils`. The `status.ts`
helper returns a `Status` union from a `ServiceState`‑shaped input — its
inputs are already structurally typed, so it stays generic by accident
already; keep it.

### 5. Router (`mortar/src/router`)

The router has zero mortar coupling — it's a generic state machine over a
`RoutesShape` record. Move the entire folder (`createRouter`,
`createRouter.test`, `Provider`, `Outlet`, `useRouter`, `useRouterInstance`,
`types`, `index`) into `@brika/tui/router`.

`@brika/tui` re‑exports it from the package root: `import { useRouter,
defineRoute, RouterProvider, Outlet } from '@brika/tui'`.

## Provider abstraction

Mortar's `MortarProvider` is a single context that bundles everything any
view might want: supervisor, services, focus, scroll, search, toast,
layout, fullscreen, chrome height, `onQuit`. Two things in there are truly
generic:

- the **chrome height** plumbing (`MeasuredChrome` reports back into
  context),
- the **`onQuit`** sink that all global keybinds and shutdown logic dispatch
  to.

To let `@brika/tui` ship a generic `<MeasuredChrome>` and a generic
`useGlobalQuit({ onQuit })`, we introduce a tiny **`<TuiShellProvider>`** in
`@brika/tui` that exposes only:

```ts
interface TuiShellState {
  readonly chromeHeight: number;
  readonly setChromeHeight: (h: number) => void;
  readonly onQuit: () => void;
}
```

Mortar's `MortarProvider` becomes a thin wrapper that mounts
`<TuiShellProvider onQuit={…}>` first, then layers its mortar state on
top via its own context. `MeasuredChrome` and `useGlobalQuit` in
`@brika/tui` talk to `TuiShellState` and stay supervisor‑free.

The Brika CLI does the same: wraps its own state context around
`<TuiShellProvider>`.

## Package shape

```
packages/tui/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts              # public re‑exports
    components/
      Card.tsx
      Footer.tsx          # generic shell only
      Kbd.tsx
      LogPane.tsx
      MainLayout.tsx      # generic SplitMainLayout
      MeasuredChrome.tsx
      ScreenChrome.tsx
      Spinner.tsx
      index.ts
    keys/
      keyToBytes.ts
      keyToBytes.test.ts
      useKey.ts
      useKey.test.ts
      useNavigationKeys.ts
      useScrollKeys.ts
      useSearchInput.ts
      useGlobalQuit.ts
      index.ts
    state/
      useFullscreen.ts
      useLayoutDimensions.ts
      useMeasure.ts
      useScroll.ts
      useSearch.ts
      useTerminalSize.ts
      useToast.ts
      index.ts
    utils/
      ansi.ts
      ansi.test.ts
      browser.ts
      browser.test.ts
      clipboard.ts
      clipboard.test.ts
      saveLog.ts
      saveLog.test.ts
      scroll.ts
      scroll.test.ts
      status.ts
      status.test.ts
      index.ts
    router/
      createRouter.ts
      createRouter.test.ts
      Outlet.tsx
      Provider.tsx
      types.ts
      useRouter.ts
      useRouterInstance.ts
      index.ts
    shell/
      TuiShellProvider.tsx
      useTuiShell.ts
      index.ts
```

## `package.json` essentials

```jsonc
{
  "name": "@brika/tui",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts",
    "./components": "./src/components/index.ts",
    "./keys": "./src/keys/index.ts",
    "./state": "./src/state/index.ts",
    "./utils": "./src/utils/index.ts",
    "./router": "./src/router/index.ts",
    "./shell": "./src/shell/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsgo --noEmit"
  },
  "peerDependencies": {
    "ink": "^6.0.0",
    "react": "^18.0.0 || ^19.0.0"
  },
  "devDependencies": {
    "@brika/testing": "workspace:*",
    "@types/bun": "^1.3.5",
    "@types/react": "^19.0.0",
    "ink": "^6.0.0",
    "react": "^19.0.0"
  }
}
```

Sub‑path exports are a nicety, not a requirement — the root `.` re‑exports
everything. They exist so consumers can write `import { useKey } from
'@brika/tui/keys'` for tighter tree‑shaking signals.

## Tests

All tests that come along (`useKey.test.ts`, `keyToBytes.test.ts`,
`createRouter.test.ts`, and the six `utils/*.test.ts`) migrate verbatim.
Each currently imports from a relative path inside mortar; the import
update is mechanical.
