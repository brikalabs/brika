/**
 * Hub-name validation and bearer-token generation, shared between every
 * signaling coordinator backend (Bun + Cloudflare Worker + future hosts).
 *
 * Storage (D1, JSON file, Postgres, …) is per-backend; the rules below are not.
 */

/** Hard length bounds run BEFORE any further check so the matcher always sees
 *  a bounded string — no chance of pathological backtracking on adversarial input. */
const NAME_MIN_LENGTH = 4;
const NAME_MAX_LENGTH = 32;

/**
 * Allowed body characters: lowercase letters, digits, hyphen. Each character is
 * checked independently so there is no quantifier ambiguity and no backtracking.
 */
const NAME_BODY_CHAR = /^[a-z0-9-]$/;
const NAME_FIRST_CHAR = /^[a-z]$/;
const NAME_ALNUM_CHAR = /^[a-z0-9]$/;

const TOKEN_BYTES = 32;

/** Hub-name shape: subdomain-safe and human-friendly. */
export interface Claim {
  /** Unique hub name (subdomain), lowercase, validated. */
  readonly name: string;
  /** Opaque bearer token the hub uses on the signaling WebSocket. */
  readonly token: string;
  /** Unix epoch (ms) the claim was first issued. */
  readonly createdAt: number;
}

/** Names we'll never let a user claim — covers core subdomains and brand terms. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set<string>([
  'admin',
  'api',
  'app',
  'auth',
  'brika',
  'clay',
  'doc',
  'docs',
  'help',
  'hubs',
  'mail',
  'public',
  'root',
  'static',
  'support',
  'system',
  'webhook',
  'webhooks',
  'www',
]);

export type ClaimErrorCode = 'invalid-name' | 'reserved' | 'taken' | 'unknown' | 'unauthorized';

export class ClaimError extends Error {
  readonly code: ClaimErrorCode;
  constructor(code: ClaimErrorCode, message: string) {
    super(message);
    this.name = 'ClaimError';
    this.code = code;
  }
}

/**
 * Normalize and validate a hub name. Returns the lowercased form on success;
 * throws {@link ClaimError} with a specific code otherwise.
 *
 * Validation is done character-by-character (no quantified regex) so the
 * matcher is provably linear and cannot be exploited for backtracking DoS.
 */
export function validateName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.length < NAME_MIN_LENGTH || lower.length > NAME_MAX_LENGTH) {
    throw new ClaimError(
      'invalid-name',
      `Name must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} chars: lowercase letters, digits, hyphens; start with a letter, end alphanumeric`
    );
  }
  const last = lower.length - 1;
  if (!NAME_FIRST_CHAR.test(lower[0] ?? '') || !NAME_ALNUM_CHAR.test(lower[last] ?? '')) {
    throw new ClaimError(
      'invalid-name',
      'Name must start with a lowercase letter and end with a letter or digit'
    );
  }
  for (let i = 1; i < last; i++) {
    if (!NAME_BODY_CHAR.test(lower[i] ?? '')) {
      throw new ClaimError(
        'invalid-name',
        'Name may contain only lowercase letters, digits, and hyphens'
      );
    }
  }
  if (RESERVED_NAMES.has(lower)) {
    throw new ClaimError('reserved', `"${lower}" is reserved`);
  }
  return lower;
}

/** Generate a cryptographically-random URL-safe bearer token. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let s = '';
  for (const b of bytes) {
    s += String.fromCodePoint(b);
  }
  const encoded = btoa(s).replaceAll('+', '-').replaceAll('/', '_');
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === '=') {
    end -= 1;
  }
  return end === encoded.length ? encoded : encoded.slice(0, end);
}
