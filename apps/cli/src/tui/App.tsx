/**
 * Top-level TUI wiring for the Brika CLI.
 *
 *   <RouterProvider>
 *     <TuiShellProvider onQuit=…>
 *       <CliProvider>
 *         <GlobalKeys/>
 *         <ShellLayout>          ← AppShell + outlet + footer
 *           <Outlet/>
 *         </ShellLayout>
 *       </CliProvider>
 *     </TuiShellProvider>
 *   </RouterProvider>
 *
 * On launch we show a brief `<BootScreen>` splash unless the caller
 * passed `boot={false}` (the `--no-boot` CLI flag wires that in).
 * Pressing any key during the splash skips it instantly.
 */

import {
  DebugProvider,
  KeyDispatchProvider,
  RouterProvider,
  TuiShellProvider,
  useRouterInstance,
} from '@brika/tui';
import { useApp } from 'ink';
import type React from 'react';
import { useCallback, useState } from 'react';
import { CliProvider } from './CliProvider';
import { BootScreen } from './components/BootScreen';
import { ShellLayout } from './components/ShellLayout';
import { useShellKeys } from './keys/useShellKeys';
import { type Routes, routes } from './routes';

interface Props {
  readonly version: string;
  /** Show the boot splash on launch. Default `true`. */
  readonly boot?: boolean;
}

export function App({ version, boot = true }: Readonly<Props>): React.ReactElement {
  const router = useRouterInstance<Routes>({ routes, initial: { name: 'dashboard' } });
  const { exit } = useApp();
  const onQuit = useCallback(() => exit(), [exit]);
  const [booting, setBooting] = useState<boolean>(boot);

  if (booting) {
    return <BootScreen version={version} onComplete={() => setBooting(false)} />;
  }

  return (
    <DebugProvider>
      <RouterProvider router={router}>
        <KeyDispatchProvider>
          <TuiShellProvider onQuit={onQuit}>
            <CliProvider version={version}>
              <GlobalKeys />
              <ShellLayout />
            </CliProvider>
          </TuiShellProvider>
        </KeyDispatchProvider>
      </RouterProvider>
    </DebugProvider>
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
