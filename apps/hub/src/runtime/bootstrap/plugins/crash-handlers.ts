/**
 * Crash Handlers — last-resort process-level safety net.
 *
 * Registers `process.on('uncaughtException')` and
 * `process.on('unhandledRejection')` handlers. Without these, an error
 * that escapes every other catch leaves the hub in a half-dead state:
 * Bun keeps the process alive but the event loop may be wedged. Here we
 * log the full error (message + stack + reason), flush the LogStore so
 * nothing is lost, and exit with RESTART_CODE so the supervisor restarts
 * us on a clean process.
 *
 * The handler is idempotent: a second crash mid-shutdown (e.g. while the
 * LogStore is closing) is swallowed rather than recursing back into
 * `process.exit`.
 */

import { inject } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { RESTART_CODE } from '@/runtime/restart-code';
import type { BootstrapPlugin } from '../plugin';

/**
 * Normalise an `unhandledRejection` reason (typed `unknown`) into an
 * `Error` the logger can fully serialise. A plain value (string, object)
 * is wrapped so the message is never lost.
 */
function toError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
}

export function crashHandlers(): BootstrapPlugin {
  return {
    name: 'crash-handlers',

    onStart() {
      const logs = inject(Logger);
      const logStore = inject(LogStore);

      // Guard against re-entrancy: once a fatal handler has fired we are
      // already on our way out, so a follow-up crash (including one
      // raised while flushing logs) must not run the exit path again.
      let crashing = false;

      const fatal = (event: 'uncaughtException' | 'unhandledRejection', error: Error): void => {
        if (crashing) {
          return;
        }
        crashing = true;

        logs.error('hub.crash', { event }, { error });

        try {
          logStore.close();
        } catch {
          // The store may already be closed or mid-flush; nothing more
          // we can safely do here.
        }

        process.exit(RESTART_CODE);
      };

      process.on('uncaughtException', (error) => {
        fatal('uncaughtException', error);
      });

      process.on('unhandledRejection', (reason) => {
        fatal('unhandledRejection', toError(reason));
      });
    },
  };
}
