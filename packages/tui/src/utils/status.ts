/**
 * Presentation helpers for a generic 4-state status — color, glyph,
 * label, crash-reason parsing. Pure functions, no state, no React.
 *
 * `TuiStatus` is structurally the same tagged union mortar's
 * `ServiceStatus` uses; any caller can pass its own status type as
 * long as it has these four shapes.
 */

export type TuiStatus =
  | { kind: 'pending' }
  | { kind: 'starting' }
  | { kind: 'healthy' }
  | { kind: 'crashed'; exitCode: number | null; reason: string };

export function statusColor(status: TuiStatus): string {
  switch (status.kind) {
    case 'pending':
      return 'cyan';
    case 'starting':
      return 'yellow';
    case 'healthy':
      return 'green';
    case 'crashed':
      return 'red';
  }
}

/**
 * Glyph for the status dot in the service list. Chosen so that each
 * state reads at a glance:
 *
 *   ◌  pending  — outlined dotted circle, "waiting / not yet"
 *   ◐  starting — half-filled circle, "in progress"
 *   ●  healthy  — solid, "running"
 *   ✘  crashed  — clear failure mark
 *
 * The earlier gray ● for pending was indistinguishable from healthy
 * for users with weak color rendering or colorblind palettes.
 */
export function statusGlyph(status: TuiStatus): string {
  switch (status.kind) {
    case 'pending':
      return '◌';
    case 'starting':
      return '◐';
    case 'healthy':
      return '●';
    case 'crashed':
      return '✘';
  }
}

/**
 * Short single-word status label, for compact displays (LogPane header,
 * dependency rows). For crashed, includes the parsed exit info.
 *
 *   pending   →  "waiting on deps"
 *   starting  →  "starting"
 *   healthy   →  "healthy"
 *   crashed   →  "exit 1"  or  "killed (SIGTERM)"  or  "spawn error"
 */
export function statusLabel(status: TuiStatus): string {
  switch (status.kind) {
    case 'pending':
      return 'waiting on deps';
    case 'starting':
      return 'starting';
    case 'healthy':
      return 'healthy';
    case 'crashed':
      return summarizeCrash(status).headline;
  }
}

export interface CrashSummary {
  /** Short headline used in the status badge — `"exit 1"` etc. */
  readonly headline: string;
  /** Optional detail line — full error message, only for spawn errors. */
  readonly detail: string | null;
}

/**
 * Parse a crashed `TuiStatus` into a structured summary. The
 * supervisor stores the reason as a free-form string built from either
 * `error.message` or a synthesized `"exited with code N"`. We pattern-
 * match those known shapes here so views can render them consistently.
 *
 * Exit codes ≥ 128 are signal terminations (`exit = 128 + signal`):
 * code 137 = SIGKILL (9), 143 = SIGTERM (15), etc. We surface the
 * signal name when we recognize it — much clearer than a bare number.
 */
export function summarizeCrash(status: Extract<TuiStatus, { kind: 'crashed' }>): CrashSummary {
  const code = status.exitCode;

  if (code !== null) {
    if (code === 0) {
      return { headline: 'exited cleanly', detail: null };
    }
    const sig = signalForCode(code);
    if (sig !== null) {
      return { headline: `killed (${sig})`, detail: null };
    }
    return { headline: `exit ${code}`, detail: null };
  }

  // No exit code — the supervisor's spawn callback fired with an error
  // before the child ran (ENOENT, EACCES, command parse error, etc.).
  const msg = status.reason.trim();
  if (msg.length === 0) {
    return { headline: 'spawn error', detail: null };
  }
  // The `error.message` for ENOENT is typically "ENOENT: no such file…";
  // promote that prefix to the headline. Split on the first `:` and
  // pattern-test only the code half — avoids ReDoS-prone alternating
  // greedy quantifiers (`\s*(.*)$`).
  const colon = msg.indexOf(':');
  if (colon > 0) {
    const code = msg.slice(0, colon);
    if (/^E[A-Z]+$/.test(code)) {
      const detail = msg.slice(colon + 1).trim();
      return { headline: code, detail: detail.length > 0 ? detail : null };
    }
  }
  return { headline: 'spawn error', detail: msg };
}

const SIGNAL_BY_CODE: Readonly<Record<number, string>> = {
  129: 'SIGHUP',
  130: 'SIGINT',
  131: 'SIGQUIT',
  134: 'SIGABRT',
  137: 'SIGKILL',
  139: 'SIGSEGV',
  141: 'SIGPIPE',
  143: 'SIGTERM',
};

function signalForCode(code: number): string | null {
  return SIGNAL_BY_CODE[code] ?? null;
}
