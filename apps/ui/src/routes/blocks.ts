import { Scope } from '@brika/auth';
import { page } from './page';

export const blockRoutes = {
  blocks: page({
    path: '/blocks',
    load: () => import('@/features/blocks'),
    select: (m) => m.BlocksPage,
    scopes: Scope.PLUGIN_READ,
  }),
};
