import { Scope } from '@brika/auth';
import { page } from './page';

export const toolRoutes = {
  tools: page({
    path: '/tools',
    load: () => import('@/features/tools'),
    select: (m) => m.ToolsPage,
    scopes: Scope.PLUGIN_READ,
  }),
};
