/**
 * Typed brick-data channels for the Matter bricks.
 *
 * Declared once and imported by both the plugin process (index.tsx, `.set(...)`)
 * and the client views (bricks/*.tsx, `.use()`), so each brick's id and payload
 * type are shared across the boundary.
 */

import { defineBrickData } from '@brika/sdk/brick-views';
import type { DeviceData, DevicesData } from './bricks/types';

export const devicesData = defineBrickData<DevicesData>('devices');
export const deviceData = defineBrickData<DeviceData>('device');
