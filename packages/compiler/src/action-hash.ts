import { createHash } from 'node:crypto';

/**
 * Deterministic action ID from file path + export name.
 * SHA-256(relativePath + "\0" + exportName) truncated to 12 hex chars (48 bits).
 *
 * Used by the Bun-side action build plugins (actions-client/actions-server),
 * ensuring IDs always match regardless of source order. `node:crypto` works
 * under Bun/Node. The isolate gate does NOT use this (node:crypto's browser
 * polyfill throws in a Worker); its report derives the same id via Web Crypto
 * in `bundle/report.ts`, which produces identical SHA-256.
 */
export function computeActionId(relativePath: string, exportName: string): string {
  return createHash('sha256').update(`${relativePath}\0${exportName}`).digest('hex').slice(0, 12);
}
