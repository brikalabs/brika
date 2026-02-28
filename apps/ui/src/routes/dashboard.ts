import { page } from './page';

export const dashboardRoutes = {
  index: page({ path: '/', load: () => import('@/features/dashboard'), select: (m) => m.DashboardPage }),
};
