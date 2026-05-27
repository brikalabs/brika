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
 * binary starts and the version baked into it is the one we expect".
 *
 * Reads `buildInfo.version` so the probe has no dependency beyond the
 * inlined build-info constants — adding `@/hub` here would pull in the
 * GitHub URL constants and any future hub-level metadata, none of
 * which the probe needs.
 */

import { buildInfo } from '../../build-info';

const BRIKA_VERSION: string = buildInfo.version;

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
 * loads — must remain dependency-free beyond `buildInfo`.
 *
 * Stdout is piped (the orchestrator captures it), and a piped stream
 * may buffer past `process.exit()` on some Bun builds. Schedule the
 * exit from the write callback so the parent always receives the
 * JSON line before the EOF.
 */
export function runSelfCheckAndExit(): never {
  const result = runSelfCheck();
  const code = result.ok ? 0 : 1;
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(code));
  // Fallback path: if the callback never fires (extremely unlikely
  // on a piped stdout), exit after a short tick. Without it the
  // process would hang forever instead of letting the orchestrator
  // observe a clean exit.
  setTimeout(() => process.exit(code), 100).unref();
  // The runtime can't infer that one of the two paths above will exit
  // — block here so the function genuinely is `never`. Empty
  // executor: the promise never resolves; one of the exits above
  // tears the process down first.
  return new Promise<never>(() => undefined) as never;
}
