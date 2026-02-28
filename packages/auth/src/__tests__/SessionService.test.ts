/**
 * @brika/auth - SessionService Unit Tests
 * Direct service tests against an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openAuthDatabase } from '../setup';
import { SessionService } from '../services/SessionService';
import { UserService } from '../services/UserService';
import { Role } from '../types';

let db: Database;
let sessionService: SessionService;
let userService: UserService;
let userId: string;

beforeEach(async () => {
  db = openAuthDatabase(':memory:');
  sessionService = new SessionService(db, 3600);
  userService = new UserService(db);
  const user = await userService.createUser('test@test.com', 'Test', Role.USER);
  userId = user.id;
});

afterEach(() => {
  db.close();
});

// ─── revokeSession ───────────────────────────────────────────────────────────

describe('revokeSession', () => {
  it('sets revoked_at so the session no longer validates', async () => {
    const token = sessionService.createSession(userId);
    const session = sessionService.validateSession(token);
    expect(session).not.toBeNull();

    const sessionId = session!.id;
    sessionService.revokeSession(sessionId);

    const result = sessionService.validateSession(token);
    expect(result).toBeNull();
  });

  it('does not throw when revoking a non-existent session id', () => {
    expect(() => {
      sessionService.revokeSession('does-not-exist');
    }).not.toThrow();
  });

  it('does not affect other sessions belonging to the same user', () => {
    const token1 = sessionService.createSession(userId);
    const token2 = sessionService.createSession(userId);

    const session1 = sessionService.validateSession(token1);
    expect(session1).not.toBeNull();

    sessionService.revokeSession(session1!.id);

    expect(sessionService.validateSession(token1)).toBeNull();
    expect(sessionService.validateSession(token2)).not.toBeNull();
  });

  it('is idempotent — revoking an already-revoked session does not throw', () => {
    const token = sessionService.createSession(userId);
    const session = sessionService.validateSession(token);
    const sessionId = session!.id;

    expect(() => {
      sessionService.revokeSession(sessionId);
      sessionService.revokeSession(sessionId);
    }).not.toThrow();
  });
});

// ─── revokeAllUserSessions ───────────────────────────────────────────────────

describe('revokeAllUserSessions', () => {
  it('revokes all active sessions for the user', () => {
    const token1 = sessionService.createSession(userId);
    const token2 = sessionService.createSession(userId);
    const token3 = sessionService.createSession(userId);

    sessionService.revokeAllUserSessions(userId);

    expect(sessionService.validateSession(token1)).toBeNull();
    expect(sessionService.validateSession(token2)).toBeNull();
    expect(sessionService.validateSession(token3)).toBeNull();
  });

  it('does not affect sessions belonging to other users', async () => {
    const otherUser = await userService.createUser('other@test.com', 'Other', Role.USER);
    const otherToken = sessionService.createSession(otherUser.id);

    sessionService.createSession(userId);
    sessionService.revokeAllUserSessions(userId);

    expect(sessionService.validateSession(otherToken)).not.toBeNull();
  });

  it('does not throw when the user has no sessions', () => {
    expect(() => {
      sessionService.revokeAllUserSessions(userId);
    }).not.toThrow();
  });

  it('does not throw for a non-existent user id', () => {
    expect(() => {
      sessionService.revokeAllUserSessions('no-such-user');
    }).not.toThrow();
  });
});

// ─── listUserSessions ────────────────────────────────────────────────────────

describe('listUserSessions', () => {
  it('returns an empty array when the user has no sessions', () => {
    const sessions = sessionService.listUserSessions(userId);
    expect(sessions).toEqual([]);
  });

  it('returns active sessions for the user', () => {
    sessionService.createSession(userId);
    sessionService.createSession(userId);

    const sessions = sessionService.listUserSessions(userId);
    expect(sessions).toHaveLength(2);
  });

  it('excludes revoked sessions', () => {
    const token1 = sessionService.createSession(userId);
    sessionService.createSession(userId);

    const session1 = sessionService.validateSession(token1);
    sessionService.revokeSession(session1!.id);

    const sessions = sessionService.listUserSessions(userId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).not.toBe(session1!.id);
  });

  it('orders results by last_seen_at DESC', () => {
    // Create sessions with a small gap so last_seen_at timestamps differ.
    // validateSession updates last_seen_at, so validate in reverse desired order.
    const token1 = sessionService.createSession(userId);
    const token2 = sessionService.createSession(userId);
    const token3 = sessionService.createSession(userId);

    // Touch them in ascending order — token3 will be most-recently seen.
    sessionService.validateSession(token1);
    sessionService.validateSession(token2);
    sessionService.validateSession(token3);

    const sessions = sessionService.listUserSessions(userId);
    expect(sessions).toHaveLength(3);

    // Verify DESC ordering by comparing consecutive lastSeenAt values.
    for (let i = 0; i < sessions.length - 1; i++) {
      expect(sessions[i].lastSeenAt).toBeGreaterThanOrEqual(sessions[i + 1].lastSeenAt);
    }
  });

  it('does not include sessions belonging to other users', async () => {
    const otherUser = await userService.createUser('other@test.com', 'Other', Role.USER);
    sessionService.createSession(otherUser.id);
    sessionService.createSession(userId);

    const sessions = sessionService.listUserSessions(userId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(userId);
  });

  it('returns SessionRecord objects with the expected shape', () => {
    const token = sessionService.createSession(userId, '127.0.0.1', 'TestAgent/1.0');
    // Validate so we get the session id back.
    const session = sessionService.validateSession(token, '127.0.0.1');
    expect(session).not.toBeNull();

    const records = sessionService.listUserSessions(userId);
    expect(records).toHaveLength(1);

    const record = records[0];
    expect(record.id).toBe(session!.id);
    expect(record.userId).toBe(userId);
    expect(typeof record.tokenHash).toBe('string');
    expect(record.ip).toBe('127.0.0.1');
    expect(record.userAgent).toBe('TestAgent/1.0');
    expect(typeof record.createdAt).toBe('number');
    expect(typeof record.lastSeenAt).toBe('number');
    expect(typeof record.expiresAt).toBe('number');
    expect(record.revokedAt).toBeNull();
  });
});

// ─── cleanExpiredSessions ────────────────────────────────────────────────────

describe('cleanExpiredSessions', () => {
  it('returns 0 when there are no sessions to clean', () => {
    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(0);
  });

  it('returns 0 for active, non-expired sessions', () => {
    // sessionService has TTL of 3600s — sessions are far from expired.
    sessionService.createSession(userId);
    sessionService.createSession(userId);

    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(0);
  });

  it('deletes expired sessions whose created_at is older than 30 days', () => {
    // Insert a session directly with timestamps that fall outside the 30-day window.
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;

    db.query(
      `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at)
       VALUES ('old-sess', ?, 'oldhash', NULL, NULL, ?, ?, ?)`
    ).run(userId, thirtyOneDaysAgo, thirtyOneDaysAgo, thirtyOneDaysAgo - 1);
    // expires_at < now and created_at < cutoff => eligible for deletion.

    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(1);
  });

  it('deletes revoked sessions whose created_at is older than 30 days', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const futureExpiry = Date.now() + 3600 * 1000;

    db.query(
      `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at)
       VALUES ('revoked-old', ?, 'revokedhash', NULL, NULL, ?, ?, ?, ?)`
    ).run(userId, thirtyOneDaysAgo, thirtyOneDaysAgo, futureExpiry, thirtyOneDaysAgo + 1);

    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(1);
  });

  it('does not delete recently-revoked sessions (created within 30 days)', () => {
    // Create and immediately revoke — created_at is now, so it should not be cleaned.
    const token = sessionService.createSession(userId);
    const session = sessionService.validateSession(token);
    sessionService.revokeSession(session!.id);

    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(0);
  });

  it('returns the correct count when multiple old sessions are cleaned', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < 3; i++) {
      db.query(
        `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`
      ).run(`old-${i}`, userId, `hash-${i}`, thirtyOneDaysAgo, thirtyOneDaysAgo, thirtyOneDaysAgo - 1);
    }

    const count = sessionService.cleanExpiredSessions();
    expect(count).toBe(3);
  });
});
