import { Scope } from '@brika/auth';
import { page } from './page';

export const analyticsRoutes = {
  list: page({
    path: '/analytics',
    load: () => import('@/features/analytics'),
    select: (m) => m.AnalyticsPage,
    scopes: [Scope.PLUGIN_READ, Scope.ADMIN_ALL],
  }),
};
