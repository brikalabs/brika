/**
 * Process Guard: process hygiene around the hub's plugin children.
 *
 * Two responsibilities:
 *
 * 1. `onInit`: reap zombie children inherited from a previous process
 *    image. `bun --watch` restarts the hub by re-exec'ing IN PLACE
 *    (same PID), so children of the old image stay attached to us, and
 *    the ones the old image killed on its way out become zombies that
 *    only WE can `waitpid()` away. A lingering zombie is not just
 *    cosmetic: `process.kill(pid, 0)` succeeds on it, so PID-liveness
 *    checks (e.g. matter.js storage-lock staleness) misjudge a stale
 *    lock as held and refuse to start. Bun exposes no waitpid, so this
 *    goes through bun:ffi. It MUST run before anything spawns children
 *    in the new image: `waitpid(-1, WNOHANG)` reaps any dead child,
 *    and stealing an exit status from Bun's own tracking would break
 *    that subprocess's `exited` promise.
 *
 * 2. `onStart`: a synchronous `process.on('exit')` handler that
 *    SIGKILLs every running plugin PID. Covers SIGTERM, SIGINT,
 *    SIGHUP, crashes: everything except `kill -9` on the hub itself.
 */

import { inject } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { BootstrapPlugin } from '../plugin';

const WNOHANG = 1;

/**
 * Reap every already-dead child of this process. Returns the number of
 * zombies collected. Best-effort: any FFI failure (unsupported
 * platform, hardened runtime) returns 0 rather than affecting boot.
 */
export async function reapInheritedZombies(): Promise<number> {
  if (process.platform === 'win32') {
    return 0;
  }
  try {
    const { dlopen, FFIType, ptr } = await import('bun:ffi');
    const libc = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', {
      waitpid: {
        args: [FFIType.i32, FFIType.ptr, FFIType.i32],
        returns: FFIType.i32,
      },
    });
    const status = new Int32Array(1);
    let reaped = 0;
    // waitpid(-1, &status, WNOHANG): >0 reaped that PID, 0 means
    // children exist but none are dead, -1 (ECHILD) means no children.
    for (;;) {
      const pid = libc.symbols.waitpid(-1, ptr(status), WNOHANG);
      if (pid <= 0) {
        break;
      }
      reaped += 1;
    }
    libc.close();
    return reaped;
  } catch {
    return 0;
  }
}

export function processGuard(): BootstrapPlugin {
  return {
    name: 'process-guard',

    async onInit() {
      const reaped = await reapInheritedZombies();
      if (reaped > 0) {
        inject(Logger).info('Reaped zombie children inherited from previous process image', {
          reaped,
        });
      }
    },

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
