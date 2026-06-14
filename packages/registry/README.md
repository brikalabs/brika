# @brika/registry

Cryptographic verification for Brika's plugin registry. Wraps the Ed25519 signing/verification flow that "verified" plugins go through before the hub agrees to load them.

## What this gives you

- `verifyWithRawKey(data, signatureHex, publicKeyBase64)`: return `true` if the Ed25519 signature over `data` is valid
- `canonicalize(value)`: deterministic JSON serialization (sorted keys, compact, no `undefined`) so signatures don't depend on field ordering
- `REGISTRY_PUBLIC_KEY` / `SPKI_HEADER`: the embedded trusted Brika key and the DER prefix used to wrap a raw Ed25519 key
- A small set of types (`VerifiedPlugin`, `VerifiedPluginsList`) describing the registry-side index

## Trust model

- The hub ships with an embedded set of trusted Brika public keys.
- A signed manifest carries a detached signature in `.brika/signature.json`.
- On load, the hub verifies that one of the trusted keys signed the canonicalized manifest.
- Unsigned (community) plugins still install, but the UI marks them clearly and gates risky permissions.

The actual signing key handling lives outside this package — this is just the verifier and the wire format.
