/**
 * Human-friendly unit schemas shared across config surfaces.
 *
 * Two value kinds, each accepted as either a raw number or a readable string,
 * and normalised to a plain number in the typed output:
 *
 *   - bytes:    `512mb`, `2gb`, `256mib`, or `536870912`  -> integer bytes
 *   - duration: `5s`, `15s`, `1h`, `7d`, `250ms`, or `5000` -> integer ms
 *
 * The inverse `formatBytes` / `formatDuration` pick the largest unit that
 * divides evenly, so a round value round-trips back to the readable form the
 * operator typed (`536870912` -> `512mb`, `5000` -> `5s`).
 */

import { z } from 'zod';

// ─── Bytes ──────────────────────────────────────────────────────────────────

/**
 * Operators think in powers of 1024 (a "512 MB" RSS limit ≈ 512 MiB), so we
 * treat `kb`/`kib`, `mb`/`mib`, `gb`/`gib`, `tb`/`tib` as synonyms. Strict SI
 * fans can still write raw integers for exact base-10 values.
 */
const BYTE_UNIT_MULTIPLIERS: Record<string, number> = {
  '': 1,
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
};

/** Hard ceiling on the string length we'll attempt to parse (a typo/fuzzer guard). */
const UNIT_STRING_MAX_LENGTH = 32;

/**
 * digits + optional `.fraction` + optional single space + unit letters,
 * anchored. Trimmed input only (the caller strips outer whitespace), which
 * avoids the `\s*` quantifiers Sonar flags as a ReDoS hotspot. `\d` and
 * `[a-z]` don't overlap, so the regex is strictly linear.
 */
const NUMERIC_UNIT_PATTERN = /^(\d+(?:\.\d+)?) ?([a-z]*)$/i;

/**
 * Parse a human-readable byte count (`"500mb"`, `"2 gb"`, `"1024"`) into a
 * non-negative integer, or `null` for malformed input / unknown units / values
 * exceeding the length cap. The caller turns `null` into a zod issue.
 */
export function parseByteString(raw: string): number | null {
  if (raw.length > UNIT_STRING_MAX_LENGTH) {
    return null;
  }
  const match = NUMERIC_UNIT_PATTERN.exec(raw.trim());
  if (!match?.[1] || match[2] === undefined) {
    return null;
  }
  const multiplier = BYTE_UNIT_MULTIPLIERS[match[2].toLowerCase()];
  if (multiplier === undefined) {
    return null;
  }
  const bytes = Number.parseFloat(match[1]) * multiplier;
  if (!Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  return Math.floor(bytes);
}

/**
 * Non-negative byte count. Accepts a raw integer (`536870912`) or a readable
 * string (`"512mb"`, `"2gb"`), normalised to a plain integer. `0` is allowed
 * (callers use it as a "disabled" sentinel).
 */
export const BytesSchema = z
  .union([
    z.number().int().nonnegative(),
    z.string().transform((raw, ctx) => {
      const parsed = parseByteString(raw);
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid byte size "${raw}". Expected an integer or a value like "512mb", "2gb", "256mib".`,
        });
        return z.NEVER;
      }
      return parsed;
    }),
  ])
  .describe('Byte count: a raw integer (`536870912`) or a readable string (`"512mb"`, `"2gb"`).');

const BYTE_FORMAT_UNITS: ReadonlyArray<readonly [string, number]> = [
  ['tb', 1024 ** 4],
  ['gb', 1024 ** 3],
  ['mb', 1024 ** 2],
  ['kb', 1024],
];

/** Render bytes as the largest unit that divides evenly (`536870912` -> `"512mb"`); `0` -> `"0"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0';
  }
  for (const [suffix, size] of BYTE_FORMAT_UNITS) {
    if (bytes % size === 0) {
      return `${bytes / size}${suffix}`;
    }
  }
  return String(bytes);
}

// ─── Duration ─────────────────────────────────────────────────────────────────

const DURATION_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const DURATION_PATTERN = /^(\d+(?:\.\d+)?) ?(ms|s|m|h|d)?$/i;

/**
 * Parse a duration (`"5s"`, `"1h"`, `"7d"`, `"250ms"`, or a bare `"5000"` =
 * milliseconds) into a non-negative integer count of milliseconds, or `null`
 * for malformed input. The caller turns `null` into a zod issue.
 */
export function parseDurationString(raw: string): number | null {
  if (raw.length > UNIT_STRING_MAX_LENGTH) {
    return null;
  }
  const match = DURATION_PATTERN.exec(raw.trim());
  if (!match?.[1]) {
    return null;
  }
  const multiplier = DURATION_UNIT_MS[(match[2] ?? 'ms').toLowerCase()];
  if (multiplier === undefined) {
    return null;
  }
  const ms = Number.parseFloat(match[1]) * multiplier;
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  return Math.floor(ms);
}

/**
 * Non-negative duration in milliseconds. Accepts a raw integer (`5000`) or a
 * readable string (`"5s"`, `"1h"`, `"7d"`), normalised to integer ms. `0` is
 * allowed (callers use it as a "disabled" sentinel).
 */
export const DurationSchema = z
  .union([
    z.number().int().nonnegative(),
    z.string().transform((raw, ctx) => {
      const parsed = parseDurationString(raw);
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid duration "${raw}". Expected ms or a value like "5s", "1h", "7d".`,
        });
        return z.NEVER;
      }
      return parsed;
    }),
  ])
  .describe(
    'Duration: integer milliseconds (`5000`) or a readable string (`"5s"`, `"1h"`, `"7d"`).'
  );

const DURATION_FORMAT_UNITS: ReadonlyArray<readonly [string, number]> = [
  ['d', 24 * 60 * 60 * 1000],
  ['h', 60 * 60 * 1000],
  ['m', 60 * 1000],
  ['s', 1000],
];

/** Render ms as the largest unit that divides evenly (`5000` -> `"5s"`); `0` -> `"0"`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0';
  }
  for (const [suffix, size] of DURATION_FORMAT_UNITS) {
    if (ms % size === 0) {
      return `${ms / size}${suffix}`;
    }
  }
  return `${ms}ms`;
}
