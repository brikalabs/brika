/**
 * {{pascal}} dashboard brick: id, display meta, and the typed data channel
 * shared between the plugin process (data.set) and the React view (data.use).
 * Kept in a .brick.ts sidecar so the view's React code never loads in the
 * plugin process.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';

export interface {{pascal}}Data {
  count: number;
  active: boolean;
}

export const {{camel}}Brick = defineBrick({
  id: '{{id}}',
  meta: {
    name: '{{pascal}}',
    description: '{{description}}',
  },
  data: z.custom<{{pascal}}Data>(),
});
