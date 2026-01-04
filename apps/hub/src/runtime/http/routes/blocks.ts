import { group, route } from '@brika/router';
import { BlockRegistry } from '@/runtime/blocks';

export const blocksRoutes = group('/api/blocks', [
  route.get('/', ({ inject }) => {
    return inject(BlockRegistry).list();
  }),

  route.get('/categories', ({ inject }) => {
    return inject(BlockRegistry).listByCategory();
  }),
]);
