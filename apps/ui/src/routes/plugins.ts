import { Scope } from '@brika/auth';
import { page } from './page';

export const pluginRoutes = {
  list: page({ path: '/plugins', load: () => import('@/features/plugins'), select: (m) => m.PluginsPage, scopes: Scope.PLUGIN_READ }),
  detail: page({
    path: '/plugins/$uid',
    load: () => import('@/features/plugins'),
    select: (m) => m.PluginDetailPage,
    scopes: Scope.PLUGIN_READ,
    children: {
      overview: page({ path: '/', load: () => import('@/features/plugins'), select: (m) => m.PluginOverviewTab }),
      tab: page({ path: '$tab', load: () => import('@/features/plugins'), select: (m) => m.PluginPageTab }),
    },
  }),
};
