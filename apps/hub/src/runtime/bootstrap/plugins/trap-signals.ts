import { inject } from '@brika/di';
import type { BrikaConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import type { Bootstrap } from '../bootstrap';
import type { BootstrapPlugin } from '../plugin';

/** Signal names that can be trapped. */
export type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

/**
 * Creates a plugin that traps OS signals for graceful shutdown.
 *
 * On signal it asks the bootstrap to drain in-flight requests and tear
 * down subsystems, bounded by the configured grace period
 * (`hub.shutdown.gracePeriodMs`). A hard-timeout fallback inside
 * {@link Bootstrap.shutdown} guarantees the process exits even if a
 * subsystem hangs, and that the log store is flushed first either way.
 */
export function trapSignals(signals: Signal[] = ['SIGINT', 'SIGTERM', 'SIGHUP']): BootstrapPlugin {
  let bootstrap: Bootstrap;
  let gracePeriodMs: number;
  // Guard against a second signal arriving mid-shutdown re-triggering the
  // whole sequence (e.g. operator hitting Ctrl-C twice).
  let shuttingDown = false;

  return {
    name: 'trap-signals',
    setup: (b) => {
      bootstrap = b;
    },
    onLoad: (config: BrikaConfig) => {
      gracePeriodMs = config.hub.shutdown.gracePeriodMs;
    },
    onStart() {
      const logs = inject(Logger);
      for (const signal of signals) {
        process.on(signal, async () => {
          if (shuttingDown) {
            return;
          }
          shuttingDown = true;
          logs.info('hub.signal', { signal, gracePeriodMs });
          const result = await bootstrap.shutdown(gracePeriodMs);
          process.exit(result === 'drained' ? 0 : 1);
        });
      }
    },
  };
}
