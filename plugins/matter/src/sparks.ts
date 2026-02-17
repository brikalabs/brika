import { z } from '@brika/sdk';
import { defineSpark } from '@brika/sdk/sparks';

/** Emitted when any Matter device changes state */
export const deviceStateChanged = defineSpark({
  id: 'device-state-changed',
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
    online: z.boolean(),
    state: z.record(z.string(), z.string()),
  }),
});

/** Emitted when a new Matter device is discovered on the network */
export const deviceDiscovered = defineSpark({
  id: 'device-discovered',
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
  }),
});
