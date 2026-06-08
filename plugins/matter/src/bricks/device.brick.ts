/**
 * Matter device control brick descriptor: id, display meta, typed per-instance
 * config, and the data channel shared with the plugin process. Imported by
 * index.tsx (`data.set`) and device.tsx (`data.use`); the payload type lives in
 * ./types.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { DeviceData } from './types';

export const deviceBrick = defineBrick({
  id: 'device',
  meta: {
    name: 'Matter Device',
    description:
      'Control any Matter device, adapting to lights, locks, covers, thermostats and more',
    category: 'control',
    icon: 'cpu',
    color: '#6366f1',
  },
  config: z.object({
    deviceId: z
      .dynamicDropdown({ label: 'Device', description: 'Select a commissioned Matter device' })
      .optional(),
  }),
  data: z.custom<DeviceData>(),
});
