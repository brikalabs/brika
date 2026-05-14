/**
 * Top-level TUI wiring for the Brika CLI.
 *
 *   <RouterProvider>
 *     <TuiShellProvider onQuit=…>
 *       <CliProvider>
 *         <GlobalKeys/>
 *         <ShellLayout>          ← sidebar + outlet + footer
 *           <Outlet/>
 *         </ShellLayout>
 *       </CliProvider>
 *     </TuiShellProvider>
 *   </RouterProvider>
 */

import { RouterProvider, TuiShellProvider, useRouterInstance } from '@brika/tui';
import { useApp } from 'ink';
import type React from 'react';
import { useCallback } from 'react';
import { CliProvider } from './CliProvider';
import { ShellLayout } from './components/ShellLayout';
import { useShellKeys } from './keys/useShellKeys';
import { type Routes, routes } from './routes';

interface Props {
  readonly version: string;
}

export function App({ version }: Readonly<Props>): React.ReactElement {
  const router = useRouterInstance<Routes>({ routes, initial: { name: 'dashboard' } });
  const { exit } = useApp();
  const onQuit = useCallback(() => exit(), [exit]);

  return (
    <RouterProvider router={router}>
      <TuiShellProvider onQuit={onQuit}>
        <CliProvider version={version}>
          <GlobalKeys />
          <ShellLayout />
        </CliProvider>
      </TuiShellProvider>
    </RouterProvider>
  );
}

/**
 * Marker component — mounts the global keybinds at the root so they
 * work from every section. Returns null since `<ShellLayout>` owns
 * the actual render.
 */
function GlobalKeys(): null {
  useShellKeys();
  return null;
}
