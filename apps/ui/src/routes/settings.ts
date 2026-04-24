import { page } from './page';

export const settingRoutes = {
  index: page({
    path: '/settings',
    load: () => import('@/features/settings'),
    select: (m) => m.SettingsPage,
  }),
  themes: page({
    path: '/settings/themes',
    load: () => import('@/features/theme-builder'),
    select: (m) => m.ThemeBuilderPage,
  }),
};
