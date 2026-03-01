/**
 * @brika/registry — shared types and crypto for the Brika plugin registry.
 *
 * Ed25519 signature verification, canonical JSON, and registry type definitions
 * used by the hub, UI, and registry CLI.
 */
import { verify } from 'node:crypto';

import { SPKI_HEADER } from './public-key';

export { REGISTRY_PUBLIC_KEY, SPKI_HEADER } from './public-key';
export type { VerifiedPlugin, VerifiedPluginsList } from './types';

// ─── Canonical JSON ──────────────────────────────────────────────────────────

/** Deterministic JSON serialization: sorted keys, compact, no undefined. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const sorted = Object.keys(value as Record<string, unknown>)
    .sort((a, b) => a.localeCompare(b))
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined);

  const pairs = sorted.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`
  );

  return `{${pairs.join(',')}}`;
}

// ─── Signature Verification ──────────────────────────────────────────────────

/** Verify an Ed25519 signature using a base64-encoded raw public key. */
export function verifyWithRawKey(
  data: string,
  signatureHex: string,
  publicKeyBase64: string
): boolean {
  const rawKey = Buffer.from(publicKeyBase64, 'base64');
  const keyObject = {
    key: Buffer.concat([SPKI_HEADER, rawKey]),
    format: 'der' as const,
    type: 'spki' as const,
  };
  return verify(null, Buffer.from(data, 'utf-8'), keyObject, Buffer.from(signatureHex, 'hex'));
}
