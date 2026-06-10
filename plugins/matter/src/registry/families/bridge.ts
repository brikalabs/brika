/**
 * Bridge family: structural device-type ids with no clusters of their own.
 *
 * An aggregator (e.g. a Hue Bridge) classifies as 'bridge' so its node keeps
 * the root nodeId and its children get `nodeId:endpoint` ids. The pump id is
 * claimed-but-unmapped on purpose: recognizing it as 'unknown' stops the
 * classifier from walking further ids on multi-type endpoints.
 */

import type { DeviceFamily } from '../types';

export const bridge: DeviceFamily = {
  id: 'bridge',
  deviceTypeIds: {
    0x000e: 'bridge', // Aggregator (e.g. Hue Bridge)
    0x0303: 'unknown', // Pump (recognized, intentionally unmapped)
  },
  clusters: [],
};
