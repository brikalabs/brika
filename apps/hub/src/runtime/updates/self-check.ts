/**
 * Self-check probe — minimal "can this binary boot?" handshake.
 *
 * The orchestrator stages a new binary at `brika.next`, then spawns
 * `brika.next --self-check` and waits up to 5 seconds for a single
 * JSON line on stdout:
 *
 *     {"ok": true, "version": "0.6.0"}
 *
 * Any other outcome — crash, hang, non-JSON output, exit != 0,
 * missing `ok: true` — is treated as a failed self-check, the
 * orchestrator deletes `brika.next`, and the live binary stays
 * untouched.
 *
 * Deliberately *does not* boot the hub: too much surface area for
 * false negatives (DB locked by the running hub, port already bound,
 * filesystem permissions, …). The only signal we care about is "the
 * binary starts and the @brika/version constant is the one we expect".
 */

import { BRIKA_VERSION } from '@brika/version';

export interface SelfCheckResult {
  ok: boolean;
  version: string;
  /** Filled with a brief reason when `ok` is false. */
  error?: string;
}

/**
 * Returns the result that should be emitted to stdout. Pure — exposed
 * so tests can call it without forking a subprocess.
 */
export function runSelfCheck(): SelfCheckResult {
  if (typeof BRIKA_VERSION !== 'string' || BRIKA_VERSION.length === 0) {
    return {
      ok: false,
      version: '',
      error: 'BRIKA_VERSION constant missing or empty in this build',
    };
  }
  return { ok: true, version: BRIKA_VERSION };
}

/**
 * Argv handler. Emits the JSON line and exits with the appropriate
 * code. Called from `apps/console/src/main.ts` *before* anything else
 * loads — must remain dependency-free beyond `@brika/version`.
 */
export function runSelfCheckAndExit(): never {
  const result = runSelfCheck();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
