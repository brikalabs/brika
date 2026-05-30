/**
 * Approximate byte-size measurement for IPC payloads.
 *
 * Bun's IPC uses `serialization: 'advanced'` (the V8 structured-clone wire
 * format), so the *exact* number of bytes that hit the pipe is an internal
 * detail we can't cheaply reproduce. Instead we walk the structured value and
 * sum a conservative per-node cost. The result is an approximation — it tracks
 * the real wire size closely enough to enforce a guard rail (it never
 * under-counts the dominant contributors: strings and binary blobs).
 *
 * Design goals:
 * - Never force a full `JSON.stringify` of the tree (that would throw on binary
 *   and double-allocate large strings).
 * - Keep the binary fast path zero-copy: `Uint8Array`/`ArrayBuffer`/typed
 *   arrays contribute their `byteLength` directly, no base64, no stringify.
 * - Short-circuit: stop walking as soon as the running total passes `limit`,
 *   so an over-limit message is rejected without traversing the whole tree.
 */

/** Per-node overhead approximating structured-clone framing/keys. */
const NODE_OVERHEAD = 8;

/** UTF-16 code units cost at most ~3 UTF-8 bytes (surrogate pairs collapse). */
const BYTES_PER_CHAR = 3;

/** Sentinel meaning "the running total already exceeded the limit". */
const OVER_LIMIT = Number.POSITIVE_INFINITY;

/** Date is serialized as a tagged 64-bit time value. */
const DATE_BYTES = 8;

function binaryByteLength(value: object): number | undefined {
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  return undefined;
}

/** Size of a primitive (non-object) node, or `undefined` if `node` is an object. */
function primitiveBytes(node: unknown): number | undefined {
  if (node === null || node === undefined) {
    return NODE_OVERHEAD;
  }
  switch (typeof node) {
    case 'boolean':
    case 'number':
    case 'symbol':
    case 'function':
      return NODE_OVERHEAD;
    case 'bigint':
      return NODE_OVERHEAD + node.toString().length;
    case 'string':
      return NODE_OVERHEAD + node.length * BYTES_PER_CHAR;
    default:
      return undefined;
  }
}

function iterableMembers(node: object): Iterable<unknown> | undefined {
  if (Array.isArray(node)) {
    return node;
  }
  if (node instanceof Set) {
    return node;
  }
  return undefined;
}

/**
 * Measure the approximate serialized size of `value` in bytes, walking until
 * `limit` is exceeded. Returns the running total; once it passes `limit` the
 * walk short-circuits and the returned number is `> limit` (not exact).
 */
export function measurePayloadBytes(value: unknown, limit: number): number {
  const seen = new Set<object>();

  function sumChildren(children: Iterable<unknown>): number {
    let total = 0;
    for (const child of children) {
      total += walk(child);
      if (total > limit) {
        return OVER_LIMIT;
      }
    }
    return total;
  }

  function walkObject(node: object): number {
    const binaryBytes = binaryByteLength(node);
    if (binaryBytes !== undefined) {
      return NODE_OVERHEAD + binaryBytes;
    }
    if (node instanceof Date) {
      return NODE_OVERHEAD + DATE_BYTES;
    }
    if (seen.has(node)) {
      return NODE_OVERHEAD;
    }
    seen.add(node);

    const members = iterableMembers(node);
    if (members) {
      return NODE_OVERHEAD + sumChildren(members);
    }
    if (node instanceof Map) {
      return NODE_OVERHEAD + sumChildren([...node.keys(), ...node.values()]);
    }

    let total = NODE_OVERHEAD;
    for (const [key, val] of Object.entries(node)) {
      total += key.length * BYTES_PER_CHAR + walk(val);
      if (total > limit) {
        return OVER_LIMIT;
      }
    }
    return total;
  }

  function walk(node: unknown): number {
    if (typeof node === 'object' && node !== null) {
      return walkObject(node);
    }
    return primitiveBytes(node) ?? NODE_OVERHEAD;
  }

  return walk(value);
}
