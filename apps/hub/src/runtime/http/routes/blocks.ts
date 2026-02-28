import { group, route } from '@brika/router';
import { BlockRegistry } from '@/runtime/blocks';

export const blocksRoutes = group({
  prefix: '/api/blocks',
  routes: [
    route.get({
      path: '/',
      handler: ({ inject }) => {
        return inject(BlockRegistry).list();
      },
    }),

    route.get({
      path: '/categories',
      handler: ({ inject }) => {
        return inject(BlockRegistry).listByCategory();
      },
    }),
  ],
});
