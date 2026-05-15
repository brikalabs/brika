/**
 * Format helpers for debug entries. Mirrors what `console.log` would
 * print: primitives stay raw, errors expand into `name: message\nstack`,
 * objects pretty-print at limited depth so we never blow the TTY with
 * a multi-megabyte dump.
 */

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_STRING_LEN = 500;

/** Render a single argument to a string. Recursion-safe via a seen set. */
export function formatValue(value: unknown, depth: number = 0, seen?: WeakSet<object>): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return formatNonObject(value);
  }
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }
  const set = seen ?? new WeakSet<object>();
  if (set.has(value)) {
    return '[Circular]';
  }
  set.add(value);
  return Array.isArray(value) ? formatArray(value, depth, set) : formatObject(value, depth, set);
}

/** Render anything that isn't `null` and isn't an object — i.e. every
 *  primitive plus functions. Split out so `formatValue` stays under
 *  Sonar's cognitive-complexity ceiling. */
function formatNonObject(value: Exclude<unknown, object | null>): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return clip(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
    return name ? `[Function: ${name}]` : '[Function]';
  }
  // Unreachable in practice — the typeof checks above are exhaustive
  // for the (excluded object) input — but the return makes the type
  // checker happy without leaning on `String()` of an unknown shape.
  return '';
}

function formatArray(arr: ReadonlyArray<unknown>, depth: number, seen: WeakSet<object>): string {
  if (arr.length === 0) {
    return '[]';
  }
  const slice = arr.slice(0, MAX_ARRAY_ITEMS);
  const parts = slice.map((v) => formatValue(v, depth + 1, seen));
  if (arr.length > MAX_ARRAY_ITEMS) {
    parts.push(`… ${arr.length - MAX_ARRAY_ITEMS} more`);
  }
  return `[ ${parts.join(', ')} ]`;
}

function formatObject(obj: object, depth: number, seen: WeakSet<object>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    const tag = Object.prototype.toString.call(obj).slice(8, -1);
    return tag === 'Object' ? '{}' : `[${tag}]`;
  }
  const slice = entries.slice(0, MAX_OBJECT_KEYS);
  const parts = slice.map(([k, v]) => `${k}: ${formatValue(v, depth + 1, seen)}`);
  if (entries.length > MAX_OBJECT_KEYS) {
    parts.push(`… ${entries.length - MAX_OBJECT_KEYS} more`);
  }
  return `{ ${parts.join(', ')} }`;
}

function clip(s: string): string {
  if (s.length <= MAX_STRING_LEN) {
    return s;
  }
  return `${s.slice(0, MAX_STRING_LEN)}… (${s.length - MAX_STRING_LEN} more chars)`;
}

/** Join a console-style arg list into a single line, like `console.log` does. */
export function formatArgs(args: ReadonlyArray<unknown>): string {
  return args.map((a) => formatValue(a)).join(' ');
}
