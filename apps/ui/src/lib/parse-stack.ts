/**
 * Parse a JavaScript Error stack into structured frames so the error
 * overlay can render a Vite / Sentry-style trace: function names, compact
 * locations, and dependency frames folded away from application code.
 *
 * Supports the V8 / Chrome format (`at fn (url:line:col)`) and the
 * Firefox / Safari format (`fn@url:line:col`). Lines that are not frames
 * (the leading message line, native markers) are dropped.
 */

export interface StackFrame {
  /** Function or method name, or null for anonymous frames. */
  readonly fn: string | null;
  /** Source URL or path, with any cache-busting query stripped. */
  readonly file: string;
  /** Compact "basename:line:col" label for display. */
  readonly location: string;
  readonly line: number | null;
  readonly column: number | null;
  /** Whether the frame lives in a dependency (node_modules / bundler deps). */
  readonly vendor: boolean;
}

const VENDOR_MARKERS = ['/node_modules/', '/.vite/deps/', '/.pnp/', 'webpack-internal:', 'node:'];

function isVendor(file: string): boolean {
  return VENDOR_MARKERS.some((marker) => file.includes(marker));
}

function stripQuery(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function basename(file: string): string {
  // Split on path separators and drop empty segments (which also absorbs any
  // trailing slash) — avoids a `/[\\/]+$/` strip that the SAST flags as a
  // backtracking-prone pattern.
  const segments = file.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? file;
}

function buildFrame(
  fn: string | null,
  locationPart: string,
  requireLineCol: boolean
): StackFrame | null {
  const trimmed = locationPart.trim();
  const match = /^(.*):(\d+):(\d+)$/.exec(trimmed);

  if (!match) {
    if (requireLineCol) {
      return null;
    }
    return {
      fn,
      file: trimmed,
      location: trimmed,
      line: null,
      column: null,
      vendor: isVendor(trimmed),
    };
  }

  const file = stripQuery(match[1]);
  const line = Number(match[2]);
  const column = Number(match[3]);
  return {
    fn,
    file,
    line,
    column,
    location: `${basename(file)}:${line}:${column}`,
    vendor: isVendor(file),
  };
}

function parseFrameLine(raw: string): StackFrame | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // V8 / Chrome: "at fn (loc)" or "at loc".
  if (trimmed.startsWith('at ')) {
    let rest = trimmed
      .slice(3)
      .replace(/^async\s+/, '')
      .trim();
    // Split "fn (loc)" into name + location with string ops rather than a
    // `(.*?)…(.*)` regex (flagged for super-linear backtracking): the first
    // "(" opens the location group, the trailing ")" closes it.
    let fn: string | null = null;
    const open = rest.indexOf('(');
    if (open !== -1 && rest.endsWith(')')) {
      fn = rest.slice(0, open).trim() || null;
      rest = rest.slice(open + 1, -1);
    }
    return buildFrame(fn, rest, false);
  }

  // Firefox / Safari: "fn@loc" or "@loc". Require a line:col so the
  // leading message line is never mistaken for a frame.
  const atIndex = trimmed.indexOf('@');
  if (atIndex !== -1) {
    const fn = trimmed.slice(0, atIndex).trim() || null;
    return buildFrame(fn, trimmed.slice(atIndex + 1), true);
  }

  return null;
}

export function parseStackTrace(stack: string | null | undefined): StackFrame[] {
  if (!stack) {
    return [];
  }
  return stack
    .split('\n')
    .map(parseFrameLine)
    .filter((frame): frame is StackFrame => frame !== null);
}
