import { Scope } from '@brika/auth';
import { page } from './page';

export const boardRoutes = {
  list: page({
    path: '/boards',
    load: () => import('@/features/boards'),
    select: (m) => m.BoardsLayout,
    scopes: Scope.WORKFLOW_READ,
    children: {
      detail: page({
        path: '$boardId',
        load: () => import('@/features/boards'),
        select: (m) => m.BoardContent,
      }),
    },
  }),
};
