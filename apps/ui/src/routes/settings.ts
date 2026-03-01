import { page } from './page';

export const settingRoutes = {
  index: page({
    path: '/settings',
    load: () => import('@/features/settings'),
    select: (m) => m.SettingsPage,
  }),
};
