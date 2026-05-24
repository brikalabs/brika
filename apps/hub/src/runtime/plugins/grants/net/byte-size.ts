/**
 * Wire-byte length of a payload, in TRUE UTF-8 bytes.
 *
 * `string.length` returns UTF-16 code units, which under-counts by up
 * to 2× for non-ASCII strings (a 100-char string of emoji is 400+
 * bytes on the wire). Every grant that enforces a byte cap (net body,
 * fs file, ws frame) must use this helper rather than `.length` so the
 * cap is honest under multi-byte input — otherwise a peer streaming
 * UTF-8 can bypass the budget.
 */
export function byteLength(payload: string | Uint8Array): number {
  return typeof payload === 'string' ? Buffer.byteLength(payload, 'utf-8') : payload.byteLength;
}
