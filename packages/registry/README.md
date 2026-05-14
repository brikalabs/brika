# @brika/registry

Cryptographic verification for Brika's plugin registry. Wraps the Ed25519 signing/verification flow that "verified" plugins go through before the hub agrees to load them.

## What this gives you

- `signManifest(manifest, privateKey)` — produce a detached signature over the canonical manifest bytes
- `verifyManifest(manifest, signature, publicKey)` — return `true` if the signature is valid
- Canonicalization helpers — JSON canonicalization that doesn't depend on field ordering
- A small set of types describing the registry-side index and signature blobs

## Trust model

- The hub ships with an embedded set of trusted Brika public keys.
- A signed manifest carries a detached signature in `.brika/signature.json`.
- On load, the hub verifies that one of the trusted keys signed the canonicalized manifest.
- Unsigned (community) plugins still install, but the UI marks them clearly and gates risky permissions.

The actual signing key handling lives outside this package — this is just the verifier and the wire format.
