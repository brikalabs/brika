/**
 * @brika/auth - Middleware
 */

export { requireAuth, type AuthContext } from './requireAuth';
export { requireScope } from './requireScope';
export { verifyToken } from './verifyToken';
export {
  canAccess,
  canAccessAll,
  createPermissionChecker,
  Features,
} from './canAccess';
