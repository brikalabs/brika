/**
 * Local-trust CLI session resolver. Plugged into `@brika/auth`'s
 * `staticTokenResolver` config hook so the verifyToken middleware
 * can recognise the token in `${BRIKA_HOME}/cli-token` without a
 * database lookup.
 *
 * The expected token is read from disk on every request, not captured
 * at boot. That way, if the CLI rotates the token (each `brika hub`
 * supervisor generates a fresh one), the running hub picks it up
 * without restarting — no stale-resolver foot-gun.
 *
 * Constant-time comparison prevents a remote attacker from probing
 * the token byte-by-byte through timing — though in practice the
 * file is loopback-only.
 */
import { timingSafeEqual } from 'node:crypto';
import { ROLE_SCOPES, Role, type Session, type StaticTokenResolver } from '@brika/auth';
import { readCliToken } from './cli-token';

const SESSION_ID = 'cli-local-trust';
const USER_ID = 'cli-local-trust';
const USER_EMAIL = 'cli@local';
const USER_NAME = 'Brika CLI';

const ADMIN_SESSION: Session = {
  id: SESSION_ID,
  userId: USER_ID,
  userEmail: USER_EMAIL,
  userName: USER_NAME,
  userRole: Role.ADMIN,
  scopes: [...ROLE_SCOPES[Role.ADMIN]],
};

/**
 * Build a resolver that compares incoming bearer tokens against the
 * current contents of `${BRIKA_HOME}/cli-token`, and returns a
 * synthetic admin session on match. Returns `null` (falls through to
 * normal session validation) when:
 *   - the token file is missing or empty
 *   - the candidate length differs from the on-disk token
 *   - constant-time compare reports a mismatch
 */
export function makeCliTokenResolver(): StaticTokenResolver {
  return (token) => {
    const expected = readCliToken();
    if (!expected) {
      return null;
    }
    const candidate = Buffer.from(token, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (candidate.length !== expectedBuf.length) {
      return null;
    }
    return timingSafeEqual(candidate, expectedBuf) ? ADMIN_SESSION : null;
  };
}
