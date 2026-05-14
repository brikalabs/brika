/**
 * Declarative route table for the TUI router.
 *
 * Each entry maps a route name to a self-contained route component
 * that reads its state from `useMortar()` and owns its own keybinds
 * via `useInput`. Routes with params declare them as the generic so
 * `router.navigate(name, params)` is end-to-end type-checked.
 *
 * App.tsx renders `<Outlet />` — no `switch (router.current.name)`
 * needed. Adding a new screen is: one component + one entry here.
 */

import { defineRoute, type RoutesShape } from '../router';
import { DependencyView } from './views/DependencyView';
import { HelpView } from './views/HelpView';
import { InputView } from './views/InputView';
import { MainView } from './views/MainView';
import { ShutdownView } from './views/ShutdownView';

export const routes = {
  main: defineRoute({ component: MainView }),
  help: defineRoute({ component: HelpView }),
  deps: defineRoute({ component: DependencyView }),
  shuttingDown: defineRoute({ component: ShutdownView }),
  input: defineRoute<{ readonly serviceId: string }>({ component: InputView }),
} as const satisfies RoutesShape;

export type Routes = typeof routes;
