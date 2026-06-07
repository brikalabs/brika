import { z } from '@brika/sdk';
import { defineSpark } from '@brika/sdk/sparks';

/** Emitted when any Matter device changes state */
export const deviceStateChanged = defineSpark({
  id: 'device-state-changed',
  meta: {
    name: 'Device State Changed',
    description: 'Emitted when any Matter device changes state',
  },
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
  meta: {
    name: 'Device Discovered',
    description: 'Emitted when a new Matter device is found on the network',
  },
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
  }),
});

/** Emitted when a device comes online (real connection event). */
export const deviceOnline = defineSpark({
  id: 'device-online',
  meta: { name: 'Device Online', description: 'Emitted when a device connects' },
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
    timestamp: z.number(),
  }),
});

/** Emitted when a device goes offline (real disconnection event). */
export const deviceOffline = defineSpark({
  id: 'device-offline',
  meta: { name: 'Device Offline', description: 'Emitted when a device disconnects' },
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
    timestamp: z.number(),
  }),
});

/**
 * Emitted for each individual attribute that changes on a device (on/off,
 * level, occupancy, contact, lock state, ...). Driven by real matter.js
 * attribute subscriptions, one spark per changed attribute.
 */
export const attributeChanged = defineSpark({
  id: 'attribute-changed',
  meta: {
    name: 'Attribute Changed',
    description: 'Emitted for each device attribute that changes',
  },
  schema: z.object({
    nodeId: z.string(),
    name: z.string(),
    deviceType: z.string(),
    attribute: z.string(),
    value: z.string(),
    timestamp: z.number(),
  }),
});
