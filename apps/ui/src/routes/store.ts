import { Scope } from '@brika/auth';
import { page } from './page';

export const storeRoutes = {
  list: page({ path: '/store', load: () => import('@/features/store'), select: (m) => m.StorePage, scopes: Scope.PLUGIN_MANAGE }),
  detail: page({ path: '/store/$source/$', load: () => import('@/features/store'), select: (m) => m.StorePluginDetailPage, scopes: Scope.PLUGIN_MANAGE }),
};
