import { chmodSync } from 'node:fs';
import { container } from '@brika/di';
import { type AuthConfig, initAuthConfig } from './config';
import { authDb } from './database';
import { AuthService } from './services/AuthService';
import { ScopeService } from './services/ScopeService';
import { SessionService } from './services/SessionService';
import { UserService } from './services/UserService';

export function openAuthDatabase(path = 'auth.db') {
  const { sqlite, path: resolved } = authDb.open(path);

  // Restrict file to owner-only access (contains password hashes and session tokens)
  if (resolved !== ':memory:') {
    try {
      chmodSync(resolved, 0o600);
    } catch {
      /* may fail on some platforms */
    }
  }

  return { sqlite };
}

export function setupAuthServices(
  database: ReturnType<typeof openAuthDatabase>,
  config?: AuthConfig
): void {
  const resolved = initAuthConfig(config);
  container.register(SessionService, {
    useValue: new SessionService(database.sqlite, resolved.session.ttl),
  });
  container.register(UserService, {
    useValue: new UserService(database.sqlite),
  });
  container.register(ScopeService, { useClass: ScopeService });
  container.register(AuthService, { useClass: AuthService });
}
