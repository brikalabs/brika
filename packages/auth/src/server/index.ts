/**
 * @brika/auth/server
 *
 * Server-side authentication module.
 *
 * @example
 * ```ts
 * import { auth } from '@brika/auth/server';
 *
 * // Hub: with API server
 * await bootstrap()
 *   .use(auth({ dataDir, server: inject(ApiServer) }))
 *   .start();
 *
 * // CLI: services + DB only
 * await bootstrapCLI()
 *   .use(auth({ dataDir }))
 *   .start();
 * ```
 */

// 🏗️ Services
export { AuthService } from '../services/AuthService';
export { UserService } from '../services/UserService';
export { SessionService } from '../services/SessionService';
export { ScopeService } from '../services/ScopeService';

// 🛡️ Middleware
export { requireAuth, type AuthContext } from '../middleware/requireAuth';
export { requireScope } from '../middleware/requireScope';
export { verifyToken } from '../middleware/verifyToken';
export {
  canAccess,
  canAccessAll,
  createPermissionChecker,
  Features,
} from '../middleware/canAccess';

// 🛠️ Route Helpers
export { requireSession } from './requireSession';
export { serveImage } from './serveImage';

// 🌐 Routes
export { allAuthRoutes as authRoutes } from './routes/index';

// 🎯 Setup & Plugin
export { openAuthDatabase, setupAuthServices } from '../setup';
export { auth } from '../plugin';
