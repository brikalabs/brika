/**
 * `ClaimStore` is the storage seam for hub claims, shared across every
 * coordinator backend (Cloudflare D1, SQLite, in-memory test double).
 *
 * Security model:
 *   - Bearer tokens and recovery codes are stored as SHA-256 hashes only.
 *     Plaintext exists exactly once, in the {@link MintedCredentials} the
 *     caller hands back to the user. A DB exfiltration leaks no live
 *     credential.
 *   - `findByToken(plaintext)` is a hash lookup; implementations hash the
 *     input internally and never log the plaintext.
 *   - Validation rules and token/recovery-code generation are owned in
 *     `claims-validation.ts`. This file describes the persistence surface and
 *     wraps a narrow {@link ClaimsExecutor} in the shared business logic via
 *     {@link createClaimStore}.
 *
 * Adding a backend = implementing the ~7 executor primitives (one SQL
 * statement each). The semantics — and the bugs you'd otherwise re-hit per
 * backend — live here once.
 */

import {
  type Claim,
  ClaimError,
  generateToken,
  hashToken,
  type MintedCredentials,
  validateName,
} from './claims-validation';

export interface ClaimStore {
  /** Lookup by hub name (case-insensitive — implementations lowercase). */
  get(name: string): Promise<Claim | null>;

  /**
   * Authentication lookup: hash the presented token and return the matching
   * claim, or null. Implementations MUST hash internally and MUST NOT log the
   * plaintext.
   */
  findByToken(token: string): Promise<Claim | null>;

  /** Number of stored claims. Powers `/v1/health`. */
  size(): Promise<number>;

  /**
   * First-come-first-serve claim of a name. Returns a plaintext bearer token
   * plus a one-time recovery code (both shown to the user once, then kept
   * only as hashes at rest). Throws {@link ClaimError}:
   *   - `invalid-name` — name failed `validateName`
   *   - `reserved`     — name is in `RESERVED_NAMES`
   *   - `taken`        — the name is already claimed
   */
  claim(rawName: string): Promise<MintedCredentials>;

  /**
   * Mint a fresh bearer token for an existing claim. Preserves `createdAt` and
   * the recovery code (the result omits `recoveryCode`). Throws
   * `ClaimError('unknown')` if the name is not claimed.
   */
  rotateToken(name: string): Promise<MintedCredentials>;

  /**
   * Mint a fresh bearer token AND a fresh recovery code given a valid recovery
   * code. The presented code is single-use — it is invalidated by the
   * rotation. Throws {@link ClaimError}:
   *   - `unknown`      — no claim for this name
   *   - `unauthorized` — recovery code does not match (or none is set)
   */
  recover(name: string, recoveryCode: string): Promise<MintedCredentials>;

  /**
   * Mint and set a fresh recovery code for an existing claim, returning the
   * plaintext (shown once). Use to opt an existing claim into recovery, or to
   * rotate a stale code. Throws `ClaimError('unknown')` if not claimed.
   */
  mintRecoveryCode(name: string): Promise<string>;

  /** Delete the claim. Returns true when a row was removed. */
  release(name: string): Promise<boolean>;
}

/** Wire row shape every backend (de)serialises. Snake case matches the SQL. */
export interface ClaimRow {
  name: string;
  token_hash: string;
  recovery_hash: string | null;
  created_at: number;
}

/**
 * Minimal storage primitives a backend must provide. All inputs are already
 * lowercased / hashed / validated by the caller — backends do plain
 * persistence, no business logic.
 */
export interface ClaimsExecutor {
  selectByName(name: string): Promise<ClaimRow | null>;
  selectByTokenHash(tokenHash: string): Promise<ClaimRow | null>;
  count(): Promise<number>;
  /**
   * Insert the row only if no claim with this name exists. Returns `true` when
   * inserted, `false` when a row already exists. MUST be atomic (a single
   * `INSERT … ON CONFLICT DO NOTHING` / `INSERT OR IGNORE`) so concurrent
   * claims of the same name can't both win.
   */
  insertIfAbsent(row: ClaimRow): Promise<boolean>;
  updateTokenHash(name: string, tokenHash: string): Promise<void>;
  updateRecoveryHash(name: string, recoveryHash: string): Promise<void>;
  updateTokenAndRecovery(name: string, tokenHash: string, recoveryHash: string): Promise<void>;
  deleteByName(name: string): Promise<boolean>;
}

/** Constant-time compare for equal-length hex digests. */
export function ctEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return diff === 0;
}

function toClaim(row: ClaimRow): Claim {
  return { name: row.name, createdAt: row.created_at };
}

/**
 * Build a {@link ClaimStore} on top of an executor. Owns every shared
 * semantic (validation, hashing, constant-time comparison, the recovery
 * flow) so backends never duplicate them.
 */
export function createClaimStore(executor: ClaimsExecutor): ClaimStore {
  return {
    async get(name) {
      const row = await executor.selectByName(name.toLowerCase());
      return row ? toClaim(row) : null;
    },

    async findByToken(token) {
      const row = await executor.selectByTokenHash(await hashToken(token));
      return row ? toClaim(row) : null;
    },

    size: () => executor.count(),

    async claim(rawName): Promise<MintedCredentials> {
      const name = validateName(rawName);
      const token = generateToken();
      const recoveryCode = generateToken();
      const createdAt = Date.now();
      const inserted = await executor.insertIfAbsent({
        name,
        token_hash: await hashToken(token),
        recovery_hash: await hashToken(recoveryCode),
        created_at: createdAt,
      });
      if (!inserted) {
        throw new ClaimError('taken', `"${name}" is already claimed`);
      }
      return { name, createdAt, token, recoveryCode };
    },

    async rotateToken(name): Promise<MintedCredentials> {
      const lower = name.toLowerCase();
      const row = await executor.selectByName(lower);
      if (!row) {
        throw new ClaimError('unknown', `"${lower}" is not claimed`);
      }
      const token = generateToken();
      await executor.updateTokenHash(lower, await hashToken(token));
      return { name: row.name, createdAt: row.created_at, token };
    },

    async recover(name, recoveryCode): Promise<MintedCredentials> {
      const lower = name.toLowerCase();
      const row = await executor.selectByName(lower);
      if (!row) {
        throw new ClaimError('unknown', `"${lower}" is not claimed`);
      }
      if (!row.recovery_hash) {
        throw new ClaimError('unauthorized', 'No recovery code is set for this claim');
      }
      const presented = await hashToken(recoveryCode);
      if (!ctEqHex(presented, row.recovery_hash)) {
        throw new ClaimError('unauthorized', 'Invalid recovery code');
      }
      const token = generateToken();
      const next = generateToken();
      await executor.updateTokenAndRecovery(lower, await hashToken(token), await hashToken(next));
      return { name: row.name, createdAt: row.created_at, token, recoveryCode: next };
    },

    async mintRecoveryCode(name): Promise<string> {
      const lower = name.toLowerCase();
      const row = await executor.selectByName(lower);
      if (!row) {
        throw new ClaimError('unknown', `"${lower}" is not claimed`);
      }
      const next = generateToken();
      await executor.updateRecoveryHash(lower, await hashToken(next));
      return next;
    },

    release: (name) => executor.deleteByName(name.toLowerCase()),
  };
}
