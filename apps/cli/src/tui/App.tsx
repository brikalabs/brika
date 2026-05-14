/**
 * Top-level TUI wiring for the Brika CLI.
 *
 *   <RouterProvider>
 *     <TuiShellProvider onQuit=…>
 *       <CliProvider version=…>
 *         <Outlet />
 *       </CliProvider>
 *     </TuiShellProvider>
 *   </RouterProvider>
 *
 * Ink's `useApp().exit()` is what actually tears down the render, so
 * we own `onQuit` here (instead of taking it as a prop) — that lets us
 * call it without a back-channel out to `cli.ts`.
 */

import { Outlet, RouterProvider, TuiShellProvider, useRouterInstance } from '@brika/tui';
import { useApp } from 'ink';
import type React from 'react';
import { useCallback } from 'react';
import { CliProvider } from './CliProvider';
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
          <Outlet />
        </CliProvider>
      </TuiShellProvider>
    </RouterProvider>
  );
}
