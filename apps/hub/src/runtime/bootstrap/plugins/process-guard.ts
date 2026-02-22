/**
 * Process Guard — kills all plugin processes when the hub exits.
 *
 * Registers a synchronous `process.on('exit')` handler that SIGKILLs every
 * running plugin PID. Covers SIGTERM, SIGINT, SIGHUP, crashes — everything
 * except `kill -9` on the hub itself.
 */

import { inject } from '@brika/di';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { BootstrapPlugin } from '../plugin';

export function processGuard(): BootstrapPlugin {
  return {
    name: 'process-guard',

    onStart() {
      const lifecycle = inject(PluginLifecycle);

      process.on('exit', () => {
        for (const p of lifecycle.listProcesses()) {
          try {
            process.kill(p.pid, 'SIGKILL');
          } catch {
            // Already dead
          }
        }
      });
    },
  };
}
