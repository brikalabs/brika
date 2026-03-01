/**
 * @brika/auth - SessionService
 * Manages server-side sessions stored in SQLite.
 * Replaces JWT-based TokenService with revocable, trackable sessions.
 */

import type { Database } from 'bun:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { injectable } from '@brika/di';
import { getAuthConfig } from '../config';
import { ROLE_SCOPES } from '../roles';
import { Role, Scope, type Session, type SessionRecord } from '../types';

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
}

interface SessionWithUserRow extends SessionRow {
  email: string;
  name: string;
  role: string;
  scopes: string | null;
}

function parseScopes(raw: string | null): Scope[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid = new Set<string>(Object.values(Scope));
    return parsed.filter((s: string) => valid.has(s)) as Scope[];
  } catch {
    return [];
  }
}

/** SHA-256 hash of a raw token */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically random session token */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

@injectable()
export class SessionService {
  private readonly sessionTTL: number;

  constructor(
    private readonly db: Database,
    sessionTTL?: number
  ) {
    this.sessionTTL = sessionTTL ?? getAuthConfig().session.ttl;
  }

  /**
   * Create a new session. Returns the raw token (only time it's available).
   * Automatically revokes the oldest sessions if the per-user limit is exceeded.
   */
  createSession(userId: string, ip?: string, userAgent?: string): string {
    const id = generateId();
    const token = generateToken();
    const tokenHash = hashToken(token);
    const now = Date.now();
    const expiresAt = now + this.sessionTTL * 1000;

    this.db
      .query(
        `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, tokenHash, ip ?? null, userAgent ?? null, now, now, expiresAt);

    // Enforce per-user session limit — revoke oldest sessions beyond the cap
    this.#enforceSessionLimit(userId, now);

    return token;
  }

  #enforceSessionLimit(userId: string, now: number): void {
    const { maxPerUser } = getAuthConfig().session;
    const activeSessions = this.db
      .query<
        {
          id: string;
        },
        [string, number]
      >(
        `SELECT id FROM sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY last_seen_at DESC`
      )
      .all(userId, now);

    if (activeSessions.length <= maxPerUser) {
      return;
    }

    // Revoke all sessions beyond the limit (oldest first, they're at the end)
    const toRevoke = activeSessions.slice(maxPerUser);
    for (const session of toRevoke) {
      this.db.query(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(now, session.id);
    }
  }

  /**
   * Validate a session token.
   * Returns the session if valid, null if expired/revoked/unknown.
   * Updates last_seen_at and ip on each successful validation (sliding expiration).
   */
  validateSession(token: string, ip?: string): Session | null {
    const tokenHash = hashToken(token);
    const now = Date.now();

    const row = this.db
      .query<SessionWithUserRow, [string]>(
        `SELECT s.*, u.email, u.name, u.role, u.scopes
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND u.is_active = 1`
      )
      .get(tokenHash);

    if (!row) {
      return null;
    }
    if (row.revoked_at !== null) {
      return null;
    }
    if (row.expires_at < now) {
      return null;
    }

    // Sliding expiration: extend session + update last_seen_at & ip
    const newExpiresAt = now + this.sessionTTL * 1000;
    this.db
      .query(
        `UPDATE sessions SET last_seen_at = ?, expires_at = ?, ip = COALESCE(?, ip) WHERE id = ?`
      )
      .run(now, newExpiresAt, ip ?? null, row.id);

    const role = (row.role as Role) ?? Role.USER;

    // Admins always get full admin scopes; others use their explicit allow-list
    const scopes: Scope[] = role === Role.ADMIN ? ROLE_SCOPES[Role.ADMIN] : parseScopes(row.scopes);

    return {
      id: row.id,
      userId: row.user_id,
      userEmail: row.email,
      userName: row.name,
      userRole: role,
      scopes,
    };
  }

  /**
   * Revoke a specific session by ID.
   */
  revokeSession(sessionId: string): void {
    const now = Date.now();
    this.db
      .query(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
      .run(now, sessionId);
  }

  /**
   * Revoke all sessions for a user.
   */
  revokeAllUserSessions(userId: string): void {
    const now = Date.now();
    this.db
      .query(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
      .run(now, userId);
  }

  /**
   * List active (non-revoked, non-expired) sessions for a user.
   */
  listUserSessions(userId: string): SessionRecord[] {
    const now = Date.now();
    const rows = this.db
      .query<SessionRow, [string, number]>(
        `SELECT * FROM sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY last_seen_at DESC`
      )
      .all(userId, now);

    return rows.map(toSessionRecord);
  }

  /**
   * Clean up expired and revoked sessions older than 30 days.
   */
  cleanExpiredSessions(): number {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = this.db
      .query(
        `DELETE FROM sessions WHERE (expires_at < ? OR revoked_at IS NOT NULL) AND created_at < ?`
      )
      .run(cutoff, cutoff);

    return result.changes;
  }

  /**
   * Get session TTL in seconds.
   */
  getSessionTTL(): number {
    return this.sessionTTL;
  }
}
