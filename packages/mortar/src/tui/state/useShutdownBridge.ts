/**
 * Forward supervisor lifecycle events to the router / ink app:
 *   - `shutting-down` → router navigates to the overlay
 *   - `shutdown`      → exit the ink tree
 *
 * Reads the router from `<RouterProvider>` directly — callers don't
 * thread it as a prop. Keeps `MortarProvider` from depending on
 * router-specific types.
 */

import { useApp } from 'ink';
import { useEffect } from 'react';
import { useRouter } from '../../router';
import type { Supervisor } from '../../supervisor';
import type { Routes } from '../routes';

export function useShutdownBridge(supervisor: Supervisor): void {
  const router = useRouter<Routes>();
  const { exit } = useApp();
  useEffect(() => {
    const off = supervisor.subscribe((event) => {
      if (event.kind === 'shutting-down') {
        router.navigate('shuttingDown');
      } else if (event.kind === 'shutdown') {
        exit();
      }
    });
    return off;
  }, [supervisor, router, exit]);
}
