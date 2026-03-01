/**
 * @brika/auth/react
 *
 * React hooks and components for authentication.
 * Use this in your Brika UI React app.
 *
 * @example
 * ```tsx
 * import { AuthProvider, useAuth } from '@brika/auth/react';
 *
 * function App() {
 *   return (
 *     // No apiUrl needed - uses window.location.origin
 *     <AuthProvider>
 *       <Dashboard />
 *     </AuthProvider>
 *   );
 * }
 *
 * function Dashboard() {
 *   const { user, login, logout } = useAuth();
 *   const canEdit = useCanAccess(Scope.WORKFLOW_WRITE);
 *
 *   return (
 *     <>
 *       <h1>Hello, {user?.name}!</h1>
 *       {canEdit && <EditButton />}
 *       <button onClick={logout}>Logout</button>
 *     </>
 *   );
 * }
 * ```
 */

export {
  AuthContext,
  type AuthContextValue,
  AuthProvider,
  type AuthProviderProps,
} from './AuthProvider';
export {
  useAuth,
  useAuthError,
  useAuthLoading,
  useCanAccess,
  useCanAccessAll,
  useFeaturePermissions,
  useSession,
  useUser,
} from './hooks';
export { type WithScopeGuardOptions, withOptionalScope, withScopeGuard } from './withScopeGuard';
