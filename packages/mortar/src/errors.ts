/**
 * Typed errors. Throw sites use these subclasses so consumers (and
 * tests) can dispatch with `err instanceof ConfigError` instead of
 * scraping `message` strings — which is brittle when copy is reworded.
 *
 * Conventions:
 *   - Every class extends {@link MortarError} (so `instanceof MortarError`
 *     matches everything we throw).
 *   - Every class sets an explicit `name` for stack-trace clarity.
 *   - Constructor signatures store any contextual data as readonly
 *     fields, then synthesize a human message — letting callers either
 *     read structured fields or print the message as-is.
 */

/** Marker base. Every error mortar throws extends this. */
export abstract class MortarError extends Error {
  override readonly name: string = 'MortarError';
}

// ─── Config ────────────────────────────────────────────────────────────────

/**
 * Schema / validation failure when parsing `mortar.yml`. `path` is a
 * dot-separated locator (`services.hub.health.port`) so the message
 * pinpoints the offending field.
 */
export class ConfigError extends MortarError {
  override readonly name = 'ConfigError';
  constructor(
    readonly path: string,
    detail: string
  ) {
    super(`${path}: ${detail}`);
  }
}

// ─── Supervisor ────────────────────────────────────────────────────────────

/** Thrown when {@link splitCommand} can't parse a YAML command string. */
export class CommandParseError extends MortarError {
  override readonly name = 'CommandParseError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Two services declared the same id in the YAML map. YAML normally
 * forbids duplicate keys, but if the Supervisor is constructed from
 * code with a hand-built array, we still want a clear error rather
 * than silent override.
 */
export class DuplicateServiceIdError extends MortarError {
  override readonly name = 'DuplicateServiceIdError';
  constructor(readonly id: string) {
    super(`duplicate service id "${id}"`);
  }
}

// ─── Health / port detection ───────────────────────────────────────────────

export type HealthCheckKind = 'http' | 'tcp' | 'auto';

/**
 * A healthcheck didn't pass within its timeout. Stores `kind`, the
 * target (URL / host:port / pid), the timeout, and the most recent
 * underlying error so callers can decide how to retry / surface it.
 */
export class HealthCheckTimeoutError extends MortarError {
  override readonly name = 'HealthCheckTimeoutError';
  override readonly cause: unknown;
  constructor(
    readonly kind: HealthCheckKind,
    readonly target: string,
    readonly timeoutMs: number,
    cause: unknown
  ) {
    const tail = cause instanceof Error ? `: ${cause.message}` : '';
    const verb = kind === 'auto' ? 'Timed out waiting for' : 'Timed out waiting for';
    const subject = kind === 'auto' ? `pid ${target} to bind a TCP port` : target;
    super(`${verb} ${subject} after ${timeoutMs}ms${tail}`);
    this.cause = cause;
  }
}

/**
 * `lsof` or `pgrep` is missing from PATH. The `auto` healthcheck
 * can't function without them — surface this once at preflight rather
 * than as a confusing healthcheck timeout.
 */
export class MissingToolError extends MortarError {
  override readonly name = 'MissingToolError';
  constructor(readonly tool: string) {
    super(
      `mortar requires \`${tool}\` for \`health: auto\`. Install it (it's preinstalled on macOS and most Linux distros), or set an explicit \`health: { kind: tcp | http | none }\` per service.`
    );
  }
}
