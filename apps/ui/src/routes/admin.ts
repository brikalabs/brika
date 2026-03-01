import { Scope } from '@brika/auth';
import { page } from './page';

export const adminRoutes = {
  users: page({
    path: '/admin/users',
    load: () => import('@/features/users'),
    select: (m) => m.UsersPage,
    scopes: Scope.ADMIN_ALL,
  }),
};
