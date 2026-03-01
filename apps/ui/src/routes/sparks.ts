import { Scope } from '@brika/auth';
import { page } from './page';

export const sparkRoutes = {
  list: page({
    path: '/sparks',
    load: () => import('@/features/events'),
    select: (m) => m.SparksPage,
    scopes: Scope.WORKFLOW_READ,
  }),
  tab: page({
    path: '/sparks/$tab',
    load: () => import('@/features/events'),
    select: (m) => m.SparksPage,
    scopes: Scope.WORKFLOW_READ,
  }),
};
