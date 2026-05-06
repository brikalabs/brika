import { page } from './page';

export const helpRoutes = {
  concepts: page({
    path: '/help/concepts',
    load: () => import('@/features/help'),
    select: (m) => m.ConceptsPage,
  }),
};
