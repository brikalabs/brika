/**
 * Minisign signature verification.
 *
 * Minisign is a tiny, dependency-free signing scheme (just an Ed25519
 * keypair) that's well-suited to single-publisher release artifacts.
 * Verifying here means a compromised GitHub release alone is not
 * enough for an attacker — they'd also have to compromise the
 * embedded public key + every chain of past binaries (TOFU).
 *
 * # Status
 *
 * The verification *code path* is wired (see `verifyMinisignFile`)
 * and the updater calls it between the SHA256 hash check and the
 * archive extraction. The public-key constant is intentionally left
 * empty in this commit — flipping signing on requires a one-time key
 * ceremony:
 *
 *   1. Generate a keypair offline: `minisign -G -p brika.pub -s brika.sec`
 *   2. Replace {@link BRIKA_SIGNING_PUBKEY_B64} with the base64-encoded
 *      32-byte raw public key (the second line of `brika.pub`, base64-
 *      decoded, bytes 10–41).
 *   3. Sign every release artifact in CI: `minisign -S -s brika.sec -m brika-linux-x64.tar.gz`
 *   4. Upload the resulting `*.minisig` alongside the artifact.
 *   5. Update `install.sh` to download + verify the signature with the
 *      embedded pubkey (or with the user's local `minisign` CLI as a
 *      first-install bootstrap).
 *
 * When {@link BRIKA_SIGNING_PUBKEY_B64} is empty, the verifier
 * returns `'skipped'` and the updater logs a warning but continues.
 * That keeps dev/canary builds runnable while the key ceremony is
 * pending; production release artifacts will gain signatures and a
 * non-empty constant in a follow-up commit.
 *
 * # Minisign format reference
 *
 *   .minisig file (text, 4 lines):
 *     L1: "untrusted comment: …"        (ignored by us)
 *     L2: base64( algo[2] || keyID[8] || ed25519_sig[64] )
 *     L3: "trusted comment: <comment>"  (comment after the colon-space)
 *     L4: base64( ed25519_sig over (sig_from_L2[10..74] || trusted_comment) )
 *
 *   algo prefix (matches `SIGALG` / `SIGALG_HASHED` in minisign 0.12):
 *     "ED" (0x45 0x44) → hashed: signed message = blake2b-512(file)   [default since 0.10]
 *     "Ed" (0x45 0x64) → legacy: signed message = file bytes          [requires `-l` to sign]
 *
 * Both modes use Ed25519 over a 64-byte message and are equally secure;
 * hashed mode just lets very large artifacts be verified without
 * holding the whole file in memory. For our ~30MB binaries the
 * operational difference is negligible. Accepting both keeps the
 * verifier interoperable across minisign versions and homebrew/apt
 * builds, none of which expose a CLI flag to pin the algorithm.
 */

import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Base64-encoded raw 32-byte Ed25519 public key, extracted from the
 * minisign pubkey (the full minisign blob is 42 bytes: 2-byte algo +
 * 8-byte key ID + 32-byte ed25519 key; this constant is just the
 * trailing 32 bytes).
 *
 * Generated on 2026-05-27. Corresponding minisign pubkey for human
 * verification (`minisign -Vm <file> -P …`):
 *   RWTPl251YqDI9vc1KoMBGt6CrU5dSYguOIWChJj761kd9joxDesfwo8g
 *
 * Rotating this constant invalidates every existing `.minisig` —
 * after rotation, push a forced release so users on the old key have
 * a signed update path to the new one.
 */
export const BRIKA_SIGNING_PUBKEY_B64 = '9zUqgwEa3oKtTl1JiC44hYKEmPvrWR32OjEN6x/CjyA=';

const ED25519_SIG_LEN = 64;
const KEY_ID_LEN = 8;
const ALGO_HASHED = 'ED';
const ALGO_LEGACY = 'Ed';

export type SignatureVerificationOutcome =
  | { status: 'verified' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Verify a minisign signature file against a payload. Pass the
 * pubkey explicitly so tests can exercise the parser with a known
 * key.
 */
export async function verifyMinisignFile(
  payloadPath: string,
  signaturePath: string,
  pubkeyB64: string = BRIKA_SIGNING_PUBKEY_B64,
  /**
   * When provided, the signed trusted comment must bind to this version and
   * asset name. CI signs the trusted comment as `brika <version> <file>`
   * precisely so a valid signature can't be re-pointed at a different release's
   * asset. Omitted in unit tests that exercise the parser with synthetic keys.
   */
  expected?: { version: string; asset: string }
): Promise<SignatureVerificationOutcome> {
  if (pubkeyB64.length === 0) {
    return { status: 'skipped', reason: 'no signing pubkey embedded in this build' };
  }

  let sigText: string;
  try {
    sigText = await readFile(signaturePath, 'utf8');
  } catch (err) {
    return {
      status: 'failed',
      reason: `signature file unreadable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const parsed = parseMinisignSignature(sigText);
  if (parsed.kind === 'error') {
    return { status: 'failed', reason: parsed.reason };
  }

  const pubkey = decodeBase64(pubkeyB64);
  if (pubkey.length !== 32) {
    return { status: 'failed', reason: `pubkey must be 32 bytes, got ${pubkey.length}` };
  }

  // 1. Verify the global (trusted-comment) signature first — that's the
  //    minisign "trusted comment" trust anchor.
  const globalMessage = Buffer.concat([
    parsed.signature,
    Buffer.from(parsed.trustedComment, 'utf8'),
  ]);
  if (!verifyEd25519(pubkey, globalMessage, parsed.globalSignature)) {
    return { status: 'failed', reason: 'global signature did not verify' };
  }

  // 1b. The global signature alone only proves SOME brika release signed SOME
  //     archive. Bind it to the expected release: the trusted comment must name
  //     both the version and the asset, defeating a re-point/downgrade between
  //     two legitimately-signed releases.
  if (expected) {
    const tc = parsed.trustedComment;
    const version = expected.version.replace(/^v/, '');
    if (!tc.includes(version) || !tc.includes(expected.asset)) {
      return {
        status: 'failed',
        reason: `trusted comment "${tc}" does not bind expected version ${version} / asset ${expected.asset}`,
      };
    }
  }

  // 2. Verify the payload signature. The signed message depends on mode:
  //    hashed → blake2b-512(file); legacy → raw file bytes.
  const payload = await readFile(payloadPath);
  const message =
    parsed.mode === 'hashed' ? createHash('blake2b512').update(payload).digest() : payload;
  if (!verifyEd25519(pubkey, message, parsed.signature)) {
    return { status: 'failed', reason: 'payload signature did not verify' };
  }

  return { status: 'verified' };
}

interface ParsedSignature {
  readonly kind: 'ok';
  readonly signature: Buffer;
  readonly globalSignature: Buffer;
  readonly trustedComment: string;
  /** `'hashed'` → signed message = blake2b-512(file); `'legacy'` → file bytes. */
  readonly mode: 'hashed' | 'legacy';
}

interface ParsedSignatureError {
  readonly kind: 'error';
  readonly reason: string;
}

function parseMinisignSignature(text: string): ParsedSignature | ParsedSignatureError {
  // Normalize CRLF → LF first. A `.minisig` that traveled through a
  // Windows editor, a misconfigured HTTP server, or a tarball with
  // `--text` translation would otherwise leave a trailing `\r` on the
  // trusted-comment line, breaking the global-signature verification
  // even though the file is byte-correct from the signer's side.
  const lines = text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((l) => l.length > 0);
  if (lines.length < 4) {
    return { kind: 'error', reason: `expected 4 lines, got ${lines.length}` };
  }

  const sigBytes = decodeBase64(lines[1] ?? '');
  if (sigBytes.length !== 2 + KEY_ID_LEN + ED25519_SIG_LEN) {
    return { kind: 'error', reason: `signature line wrong length (${sigBytes.length})` };
  }
  const algo = sigBytes.subarray(0, 2).toString('ascii');
  let mode: 'hashed' | 'legacy';
  if (algo === ALGO_HASHED) {
    mode = 'hashed';
  } else if (algo === ALGO_LEGACY) {
    mode = 'legacy';
  } else {
    return {
      kind: 'error',
      reason: `unsupported minisign algorithm "${algo}" (expected "Ed" or "ED")`,
    };
  }
  const signature = sigBytes.subarray(2 + KEY_ID_LEN);

  const trustedCommentLine = lines[2] ?? '';
  const TRUSTED_PREFIX = 'trusted comment: ';
  if (!trustedCommentLine.startsWith(TRUSTED_PREFIX)) {
    return { kind: 'error', reason: 'missing "trusted comment:" line' };
  }
  const trustedComment = trustedCommentLine.slice(TRUSTED_PREFIX.length);

  const globalSignature = decodeBase64(lines[3] ?? '');
  if (globalSignature.length !== ED25519_SIG_LEN) {
    return {
      kind: 'error',
      reason: `global signature wrong length (${globalSignature.length})`,
    };
  }

  return { kind: 'ok', signature, globalSignature, trustedComment, mode };
}

function decodeBase64(s: string): Buffer {
  return Buffer.from(s.trim(), 'base64');
}

/**
 * `crypto.verify('ed25519', …)` takes a `KeyObject`, not raw bytes —
 * but Ed25519 keys have a standard JWK representation (RFC 8037 OKP):
 * `{kty: "OKP", crv: "Ed25519", x: <base64url(raw 32 bytes)>}`. JWK
 * input is portable across Node and Bun and sidesteps the ASN.1
 * byte-poking that earlier revisions of this file relied on.
 */
function verifyEd25519(pubkeyRaw: Buffer, message: Buffer, signature: Buffer): boolean {
  try {
    const key = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: pubkeyRaw.toString('base64url'),
      },
      format: 'jwk',
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}
