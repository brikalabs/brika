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

import { type Claim, ClaimError, generateToken, validateName } from '@brika/remote-access-protocol';

export {
  type Claim,
  ClaimError,
  type ClaimErrorCode,
  RESERVED_NAMES,
  validateName,
} from '@brika/remote-access-protocol';

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
