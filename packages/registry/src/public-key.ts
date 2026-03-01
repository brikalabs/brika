/** Base64-encoded raw 32-byte Ed25519 public key for the official Brika registry. */
export const REGISTRY_PUBLIC_KEY = 'ncl/idhhH3NPxm3Gy6Rjk9CZ3Cv4vBkze5sUFShYhnc=';

/** 12-byte DER prefix for Ed25519 SPKI keys (OID 1.3.101.112). */
export const SPKI_HEADER = new Uint8Array([48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0]);
