import { Scope } from '@brika/auth';
import { page } from './page';

export const logRoutes = {
  list: page({
    path: '/logs',
    load: () => import('@/features/logs'),
    select: (m) => m.LogsPage,
    scopes: [
      Scope.PLUGIN_READ,
      Scope.ADMIN_ALL,
    ],
  }),
};
