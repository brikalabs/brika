import { inject } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';
import type { BootstrapPlugin } from '../plugin';

/** Signal names that can be trapped. */
export type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

/**
 * Creates a plugin that traps OS signals for graceful shutdown.
 */
export function trapSignals(signals: Signal[] = ['SIGINT', 'SIGTERM', 'SIGHUP']): BootstrapPlugin {
  // Import bootstrap lazily to avoid circular dependency
  let stopFn: () => Promise<void>;

  return {
    name: 'trap-signals',
    setup: (b) => {
      stopFn = () => b.stop();
    },
    onStart() {
      const logs = inject(Logger);
      for (const signal of signals) {
        process.on(signal, async () => {
          logs.info('hub.signal', {
            signal,
          });
          await stopFn();
          process.exit(0);
        });
      }
    },
  };
}
