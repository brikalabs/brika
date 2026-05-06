import { Scope } from '@brika/auth';
import { page } from './page';

export const settingRoutes = {
  index: page({
    path: '/settings',
    load: () => import('@/features/settings'),
    select: (m) => m.SettingsLayout,
    children: {
      appearance: page({
        path: 'appearance',
        load: () => import('@/features/settings'),
        select: (m) => m.AppearancePage,
      }),
      language: page({
        path: 'language',
        load: () => import('@/features/settings'),
        select: (m) => m.LanguagePage,
      }),
      time: page({
        path: 'time',
        load: () => import('@/features/settings'),
        select: (m) => m.TimePage,
      }),
      location: page({
        path: 'location',
        load: () => import('@/features/settings'),
        select: (m) => m.LocationPage,
        scopes: Scope.ADMIN_ALL,
      }),
      hub: page({
        path: 'hub',
        load: () => import('@/features/settings'),
        select: (m) => m.HubPage,
        scopes: Scope.ADMIN_ALL,
      }),
      system: page({
        path: 'system',
        load: () => import('@/features/settings'),
        select: (m) => m.SystemPage,
        scopes: Scope.ADMIN_ALL,
      }),
    },
  }),
  // Theme builder stays a full-bleed editor outside the settings sidebar
  themes: page({
    path: '/settings/themes',
    load: () => import('@/features/theme-builder'),
    select: (m) => m.ThemeBuilderPage,
  }),
};
