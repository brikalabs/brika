# Tasks

A sequenced checklist that mirrors the in‑session task tracker. Each top
item is a single reviewable PR (or a small series). Sub‑items are the
discrete steps inside that PR.

> Mirror of the live `TaskCreate` list — keep both in sync as we go.

## Phase 0 — Plan & scaffold

- [x] **#1 Draft plan docs.** This folder.
- [ ] **#2 Scaffold `@brika/tui`.**
  - [ ] `packages/tui/package.json` (peer ink + react)
  - [ ] `packages/tui/tsconfig.json`
  - [ ] `packages/tui/src/index.ts` (empty re‑exports)
  - [ ] Workspace install passes
  - [ ] `bun --filter @brika/tui typecheck` passes

- [ ] **#5 Scaffold `@brika/brix`.**
  - [ ] `packages/brix/package.json`
  - [ ] `packages/brix/src/moods.ts` (table of all moods)
  - [ ] `packages/brix/src/animations.ts` (frame sets)
  - [ ] `packages/brix/src/Brix.tsx`
  - [ ] `packages/brix/src/BrixAnimated.tsx`
  - [ ] `packages/brix/src/BrixSay.tsx`
  - [ ] `packages/brix/src/BrixHeader.tsx`
  - [ ] `packages/brix/src/BrixStatusline.tsx`
  - [ ] `packages/brix/src/brixLog.ts`
  - [ ] `packages/brix/src/brand.ts`
  - [ ] `moods.test.ts` + `brixLog.test.ts`

## Phase 1 — Extract TUI from mortar (#3)

Sequence detailed in [`mortar-migration.md`](mortar-migration.md):

- [ ] Move `router/*` to `@brika/tui/router`
- [ ] Move `tui/utils/*` to `@brika/tui/utils`
- [ ] Move generic state hooks to `@brika/tui/state`
- [ ] Move generic key hooks to `@brika/tui/keys`
- [ ] Add `@brika/tui/shell/TuiShellProvider`
- [ ] Move generic components (`Kbd`, `Card`, `Spinner`, `MeasuredChrome`,
      `ScreenChrome`, `LogPane`, `SplitMainLayout`) to `@brika/tui/components`
- [ ] Refactor `ScreenChrome` to accept `wordmark` / `brand` props
- [ ] Refactor `LogPane` to accept `lines/searchQuery/currentMatchLine`

## Phase 2 — Migrate mortar onto `@brika/tui` (#4)

- [ ] Update every mortar import to `@brika/tui`
- [ ] Replace `MortarProvider` body with `<TuiShellProvider>` + state
      provider
- [ ] Pass wordmark/brand to `ScreenChrome` everywhere mortar uses it
- [ ] `bun --filter @brika/mortar test` green
- [ ] `bun --filter @brika/mortar typecheck` green
- [ ] Visual smoke test recorded in the PR description

## Phase 3 — New `apps/cli` (#6, #7, #8, #9)

- [ ] **#6 Scaffold `apps/cli`** — package.json, bin entry, command
      registration, empty dashboard view that renders `<BrixHeader />`
      + “coming soon”.
- [ ] **#7 Port commands**, in order:
  - [ ] `status` (smallest, hits `pid()` only)
  - [ ] `version` (uses `BrixHeader compact`)
  - [ ] `stop`, `restart`
  - [ ] `start` (depends on the CLI ↔ hub spawn decision — see
        [`brika-cli.md`](brika-cli.md) open questions)
  - [ ] `open`, `log`
  - [ ] `auth/*`, `plugin/*`, `channel`, `update`, `uninstall`,
        `completions`
- [ ] **#8 Dashboard view** — wire `HubStatusCard`, `PluginsCard`,
      `WorkflowsCard`, `LogPreviewCard`, key handler, Brix mood plumbing.
- [ ] **#9 Drill‑down views** — plugin list/detail, workflow list/detail,
      log tail full‑screen.

## Phase 4 — Cutover (#10)

- [ ] Decide coexist vs replace (see open question in `brika-cli.md`).
- [ ] If coexist: ship `apps/cli` behind `BRIKA_NEW_CLI=1`; the bin in
      `apps/hub` proxies when set.
- [ ] If replace: switch `bin.brika` from `apps/hub` to `apps/cli`,
      delete `apps/hub/src/cli*` and update install scripts.

## Phase 5 — Tests, types, lint (#11)

- [ ] `bun --filter '*' test`
- [ ] `bun --filter '*' typecheck`
- [ ] `bunx biome check .`
- [ ] Manual smoke walk‑through:
  - [ ] `brika` (dashboard renders, Brix in headers)
  - [ ] `brika start` → `brika status` → `brika log -f` → `brika stop`
  - [ ] `brika plugin list`
  - [ ] `mortar` (unchanged behaviour)

## Cross‑cutting reminders

- `Readonly<>` on every component props type (memory rule).
- No `as` / `any` casts.
- No legacy/compatibility shims — clean cut.
- No new shared Tailwind class constants (we're not in the React app).
- No AI attribution in commits / PR descriptions.
