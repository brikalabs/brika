/**
 * Opt-in update telemetry — emits a small POST after each apply
 * outcome so we can aggregate "what % of upgrades roll back" /
 * "what's the channel split" / "what's the median apply duration"
 * across deployed installs. Disabled by default.
 *
 * Enabling is a two-key handshake:
 *
 *   1. The operator opts in:           `BRIKA_TELEMETRY_UPDATES=1`
 *   2. The build embeds an endpoint:   `BRIKA_TELEMETRY_URL=https://…`
 *
 * Both have to be set or we no-op. Reasons to keep that separation:
 *
 *   - Users running their own forks shouldn't accidentally post to
 *     brika.dev just because they opted in.
 *   - Anyone auditing the binary can grep for the URL and verify
 *     where data goes; it's never silently configured at runtime.
 *
 * Payload is intentionally minimal: anonymous instance ID (the
 * existing 8-hex from `brikaContext.instanceId`), versions involved,
 * outcome (`success` | `rolled-back` | `failed`), and timings. No
 * plugin names, no user IDs, no IP — GitHub already sees the IP
 * when the download happens, so this endpoint adds nothing on that
 * axis.
 */

import { homedir } from 'node:os';
import { brikaContext } from '@/runtime/context/brika-context';

const TELEMETRY_URL_ENV = 'BRIKA_TELEMETRY_URL';
const TELEMETRY_OPT_IN_ENV = 'BRIKA_TELEMETRY_UPDATES';

export type ApplyOutcome = 'success' | 'rolled-back' | 'failed';

export interface UpdateTelemetryEvent {
  instanceId: string;
  fromVersion: string;
  toVersion: string;
  channel: string;
  outcome: ApplyOutcome;
  durationMs: number;
  reason?: string;
}

/**
 * True when the user has opted in *and* the build has an endpoint
 * baked in. Exposed so the UI can show an honest "telemetry off"
 * label.
 */
export function isTelemetryEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const optIn = env[TELEMETRY_OPT_IN_ENV];
  const url = env[TELEMETRY_URL_ENV];
  return (
    typeof url === 'string' &&
    url.length > 0 &&
    typeof optIn === 'string' &&
    (optIn === '1' || optIn.toLowerCase() === 'true')
  );
}

/**
 * Strip the OS home directory + the Brika data dir from a string,
 * replacing them with `~` / `<brikaDir>` placeholders. fs errors from
 * `node:fs` typically include the absolute path that failed —
 * `ENOENT: no such file or directory, open '/home/<user>/.brika/...'`
 * leaks the OS username. This sanitiser is a thin defence; the real
 * privacy guard is that telemetry is off by default.
 */
/** Escape every regex metacharacter so a path can be spliced into a RegExp safely. */
const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;
function escapeForRegExp(literal: string): string {
  return literal.replace(REGEX_META_RE, String.raw`\$&`);
}

/**
 * Refuse to build a redaction regex for paths shorter than this —
 * `home === '/'` (root user in a minimal container) or any 1-2 char
 * "path" would match every slash in the message and collapse the
 * redacted string into garbage (`/etc/passwd` → `~etc~passwd`),
 * which is both useless for forensics AND still leaks the path via
 * partial replacement.
 */
const MIN_REDACT_PATH_LEN = 5;

export function redactPaths(message: string): string {
  let out = message;
  const home = homedir();
  if (home.length >= MIN_REDACT_PATH_LEN) {
    out = out.replace(new RegExp(escapeForRegExp(home), 'g'), '~');
  }
  const brikaDir = brikaContext.brikaDir;
  if (brikaDir.length >= MIN_REDACT_PATH_LEN) {
    out = out.replace(new RegExp(escapeForRegExp(brikaDir), 'g'), '<brikaDir>');
  }
  return out;
}

/**
 * Fire-and-forget POST. Errors are swallowed — telemetry must never
 * affect the success/failure path of an apply.
 */
export async function emitUpdateTelemetry(
  event: Omit<UpdateTelemetryEvent, 'instanceId'>,
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> {
  if (!isTelemetryEnabled(env)) {
    return;
  }
  const url = env[TELEMETRY_URL_ENV];
  if (typeof url !== 'string' || url.length === 0) {
    return;
  }

  const payload: UpdateTelemetryEvent = {
    instanceId: brikaContext.instanceId,
    ...event,
    reason: event.reason === undefined ? undefined : redactPaths(event.reason),
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `brika/${brikaContext.version}`,
      },
      body: JSON.stringify(payload),
      // Short timeout — never block apply progress on a slow endpoint.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Telemetry failures are intentional swallows.
  }
}
