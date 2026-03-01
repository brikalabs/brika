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

export {
  canAccess,
  canAccessAll,
  createPermissionChecker,
  Features,
} from '../middleware/canAccess';
// 🛡️ Middleware
export { type AuthContext, requireAuth } from '../middleware/requireAuth';
export { requireScope } from '../middleware/requireScope';
export { verifyToken } from '../middleware/verifyToken';
export { auth } from '../plugin';
// 🏗️ Services
export { AuthService } from '../services/AuthService';
export { ScopeService } from '../services/ScopeService';
export { SessionService } from '../services/SessionService';
export { UserService } from '../services/UserService';
// 🎯 Setup & Plugin
export { openAuthDatabase, setupAuthServices } from '../setup';
// 🛠️ Route Helpers
export { requireSession } from './requireSession';
// 🌐 Routes
export { allAuthRoutes as authRoutes } from './routes/index';
export { serveImage } from './serveImage';
