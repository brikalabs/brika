/**
 * Matter commissioning brick descriptor: id + display meta only. The view is
 * action-driven (it pairs devices via plugin actions) with no server-pushed data
 * or per-instance config, so `data` and `config` are empty.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';

export const commissionBrick = defineBrick({
  id: 'commission',
  meta: {
    name: 'Add a Matter Device',
    description: 'Pair a new Matter device from a dashboard with its setup code',
    category: 'control',
    icon: 'plus',
    color: '#6366f1',
  },
  config: z.object({}),
  data: z.object({}),
});
