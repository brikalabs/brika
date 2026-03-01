/**
 * @brika/registry — shared types and crypto for the Brika plugin registry.
 *
 * Ed25519 signature verification, canonical JSON, and registry type definitions
 * used by the hub, UI, and registry CLI.
 */
import { verify } from 'node:crypto';

export type { VerifiedPlugin, VerifiedPluginsList } from './types';

// ─── Public Key ──────────────────────────────────────────────────────────────

/** Base64-encoded raw 32-byte Ed25519 public key for the official Brika registry. */
export const REGISTRY_PUBLIC_KEY = 'ncl/idhhH3NPxm3Gy6Rjk9CZ3Cv4vBkze5sUFShYhnc=';

/** 12-byte DER prefix for Ed25519 SPKI keys (OID 1.3.101.112). */
export const SPKI_HEADER = new Uint8Array([
  48,
  42,
  48,
  5,
  6,
  3,
  43,
  101,
  112,
  3,
  33,
  0,
]);

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
    key: Buffer.concat([
      SPKI_HEADER,
      rawKey,
    ]),
    format: 'der' as const,
    type: 'spki' as const,
  };
  return verify(null, Buffer.from(data, 'utf-8'), keyObject, Buffer.from(signatureHex, 'hex'));
}
