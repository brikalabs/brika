/**
 * D1-backed claim store.
 *
 * Same surface as the Bun coordinator's in-memory ClaimStore — first-come-
 * first-serve names, opaque random tokens, reserved-name list, token rotation
 * and release. The persistence layer just swaps a JSON file for a D1 table.
 *
 * Authentication queries the `claims_token_idx` index, which makes
 * `findByToken(token)` an indexed lookup rather than a table scan.
 */

const NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;
const TOKEN_BYTES = 32;

export const RESERVED_NAMES = new Set<string>([
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

export interface Claim {
  readonly name: string;
  readonly token: string;
  readonly createdAt: number;
}

export type ClaimErrorCode = 'invalid-name' | 'reserved' | 'taken' | 'unknown' | 'unauthorized';

export class ClaimError extends Error {
  readonly code: ClaimErrorCode;
  constructor(code: ClaimErrorCode, message: string) {
    super(message);
    this.name = 'ClaimError';
    this.code = code;
  }
}

export function validateName(name: string): string {
  const lower = name.toLowerCase();
  if (!NAME_PATTERN.test(lower)) {
    throw new ClaimError(
      'invalid-name',
      'Name must be 4-32 chars: lowercase letters, digits, hyphens; start with a letter, end alphanumeric'
    );
  }
  if (RESERVED_NAMES.has(lower)) {
    throw new ClaimError('reserved', `"${lower}" is reserved`);
  }
  return lower;
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let s = '';
  for (const b of bytes) {
    s += String.fromCodePoint(b);
  }
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Row layout in D1. SQLite stores everything as TEXT/INTEGER; we hydrate
 * `createdAt` to a JS number on read.
 */
interface ClaimRow {
  name: string;
  token: string;
  created_at: number;
}

export class D1ClaimStore {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async get(name: string): Promise<Claim | null> {
    const row = await this.#db
      .prepare('SELECT name, token, created_at FROM claims WHERE name = ?')
      .bind(name.toLowerCase())
      .first<ClaimRow>();
    return row ? this.#toClaim(row) : null;
  }

  async findByToken(token: string): Promise<Claim | null> {
    const row = await this.#db
      .prepare('SELECT name, token, created_at FROM claims WHERE token = ?')
      .bind(token)
      .first<ClaimRow>();
    return row ? this.#toClaim(row) : null;
  }

  async size(): Promise<number> {
    const row = await this.#db.prepare('SELECT COUNT(*) AS n FROM claims').first<{ n: number }>();
    return row?.n ?? 0;
  }

  async claim(rawName: string): Promise<Claim> {
    const name = validateName(rawName);
    const token = generateToken();
    const createdAt = Date.now();
    try {
      await this.#db
        .prepare('INSERT INTO claims (name, token, created_at) VALUES (?, ?, ?)')
        .bind(name, token, createdAt)
        .run();
    } catch (err) {
      // D1 surfaces UNIQUE constraint failures as a generic error containing
      // "UNIQUE" in the message — pattern-match instead of relying on codes.
      if (err instanceof Error && /UNIQUE/.test(err.message)) {
        throw new ClaimError('taken', `"${name}" is already claimed`);
      }
      throw err;
    }
    return { name, token, createdAt };
  }

  async rotateToken(name: string): Promise<Claim> {
    const lower = name.toLowerCase();
    const existing = await this.get(lower);
    if (!existing) {
      throw new ClaimError('unknown', `"${lower}" is not claimed`);
    }
    const next = generateToken();
    await this.#db.prepare('UPDATE claims SET token = ? WHERE name = ?').bind(next, lower).run();
    return { ...existing, token: next };
  }

  async release(name: string): Promise<boolean> {
    const result = await this.#db
      .prepare('DELETE FROM claims WHERE name = ?')
      .bind(name.toLowerCase())
      .run();
    // D1 result.meta.changes is the affected-row count.
    return (result.meta?.changes ?? 0) > 0;
  }

  #toClaim(row: ClaimRow): Claim {
    return { name: row.name, token: row.token, createdAt: row.created_at };
  }
}
