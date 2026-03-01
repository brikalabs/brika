import { page } from './page';

export const authRoutes = {
  profile: page({
    path: '/profile',
    load: () => import('@/features/auth'),
    select: (m) => m.ProfilePage,
  }),
};
