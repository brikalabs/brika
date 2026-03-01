/**
 * @brika/auth - Setup
 * Opens SQLite database, creates schema, registers services in DI.
 */

import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { container } from '@brika/di';
import { type AuthConfig, initAuthConfig } from './config';
import { AuthService } from './services/AuthService';
import { ScopeService } from './services/ScopeService';
import { SessionService } from './services/SessionService';
import { UserService } from './services/UserService';

/**
 * Open the SQLite database and create tables if needed.
 */
export function openAuthDatabase(path: string): Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), {
      recursive: true,
      mode: 0o700,
    });
  }

  const db = new Database(path, {
    strict: true,
  });

  // Restrict database file to owner-only access (contains password hashes and session data)
  if (path !== ':memory:') {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* may fail on some platforms */
    }
  }
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      avatar_data BLOB,
      avatar_mime TEXT,
      avatar_hash TEXT,
      scopes TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');

  return db;
}

/**
 * Register all auth services in the DI container.
 * Must be called after `openAuthDatabase`.
 */
export function setupAuthServices(db: Database, config?: AuthConfig): void {
  const resolved = initAuthConfig(config);
  container.register(SessionService, {
    useValue: new SessionService(db, resolved.session.ttl),
  });
  container.register(UserService, {
    useValue: new UserService(db),
  });
  container.register(ScopeService, {
    useClass: ScopeService,
  });
  container.register(AuthService, {
    useClass: AuthService,
  });
}
