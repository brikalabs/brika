/**
 * Shared type definitions for Matter client-rendered bricks.
 *
 * Client bricks cannot import from plugin runtime code (matter-controller.ts),
 * so DeviceType is re-declared here as a string literal union.
 */

export type DeviceType =
  | 'light'
  | 'lock'
  | 'cover'
  | 'thermostat'
  | 'switch'
  | 'sensor'
  | 'bridge'
  | 'unknown';

/** Full device state as pushed to the "device" brick via setBrickData */
export interface DeviceState {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
  state: Record<string, unknown>;
}

/** Data shape for the single-device brick */
export interface DeviceData {
  deviceMap: Record<string, DeviceState>;
}

/** Summary for the devices overview brick */
export interface DeviceSummary {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
}

/** Data shape for the devices overview brick */
export interface DevicesData {
  devices: DeviceSummary[];
}
