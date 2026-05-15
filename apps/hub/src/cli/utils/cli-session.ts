/**
 * Local-trust CLI session resolver. Plugged into `@brika/auth`'s
 * `staticTokenResolver` config hook so the verifyToken middleware
 * can recognise the token in `${BRIKA_HOME}/cli-token` without a
 * database lookup.
 *
 * Constant-time comparison prevents a remote attacker from probing
 * the token byte-by-byte through timing — though in practice the
 * file is loopback-only.
 */
import { timingSafeEqual } from 'node:crypto';
import { ROLE_SCOPES, Role, type Session, type StaticTokenResolver } from '@brika/auth';

const SESSION_ID = 'cli-local-trust';
const USER_ID = 'cli-local-trust';
const USER_EMAIL = 'cli@local';
const USER_NAME = 'Brika CLI';

/**
 * Build a resolver that matches `expected` and returns a synthetic
 * admin Session. The expected token is captured by closure so the
 * supervisor can rotate it on restart without restarting the auth
 * plugin.
 */
export function makeCliTokenResolver(expected: string): StaticTokenResolver {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const adminSession: Session = {
    id: SESSION_ID,
    userId: USER_ID,
    userEmail: USER_EMAIL,
    userName: USER_NAME,
    userRole: Role.ADMIN,
    scopes: [...ROLE_SCOPES[Role.ADMIN]],
  };

  return (token) => {
    const candidate = Buffer.from(token, 'utf8');
    if (candidate.length !== expectedBuf.length) {
      return null;
    }
    return timingSafeEqual(candidate, expectedBuf) ? adminSession : null;
  };
}
