/**
 * App.tsx — top-level wiring.
 *
 * No state, no keybind dispatch, no view switch. Just:
 *
 *   1. Build the router (typed against the declarative `routes` table).
 *   2. Wrap with `<RouterProvider>` so descendants can `useRouter()`.
 *   3. Wrap with `<MortarProvider>` so descendants can `useMortar()`
 *      for the shared TUI state (supervisor, focus, scroll, search…).
 *   4. Render the active route via `<Outlet />`.
 *
 * Every screen is its own self-contained component in
 * `tui/<Name>View.tsx`, listed in `routes.ts`. Adding a new screen
 * is: write the component + add one entry to `routes`.
 */

import type React from 'react';
import { Outlet, RouterProvider, useRouterInstance } from '../router';
import type { Supervisor } from '../supervisor';
import { useGlobalQuit } from './keys/useGlobalQuit';
import { MortarProvider } from './MortarProvider';
import { type Routes, routes } from './routes';

interface Props {
  readonly supervisor: Supervisor;
  readonly onQuit: () => void;
}

export function App({ supervisor, onQuit }: Readonly<Props>): React.ReactElement {
  const router = useRouterInstance<Routes>({ routes, initial: { name: 'main' } });
  return (
    <RouterProvider router={router}>
      <MortarProvider supervisor={supervisor} onQuit={onQuit}>
        <GlobalKeybinds />
        <Outlet />
      </MortarProvider>
    </RouterProvider>
  );
}

/**
 * Marker component that mounts always-on keybinds (quit, etc.) at the
 * root. Exists so the hook calls have a place to live inside the
 * router + mortar providers without polluting `App`'s render.
 */
function GlobalKeybinds(): null {
  useGlobalQuit();
  return null;
}
