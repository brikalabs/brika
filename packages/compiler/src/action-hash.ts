/**
 * Deterministic action ID from file path + export name.
 * SHA-256(relativePath + "\0" + exportName) truncated to 12 hex chars (48 bits).
 *
 * Used by both the server-side and client-side build plugins,
 * ensuring IDs always match regardless of source order.
 */
export function computeActionId(relativePath: string, exportName: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(relativePath + '\0' + exportName);
  return hasher.digest('hex').slice(0, 12);
}
