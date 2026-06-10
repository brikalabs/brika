/**
 * Shared type definitions for Matter client-rendered bricks.
 *
 * Client bricks cannot import from plugin runtime code (matter-controller.ts),
 * so DeviceType comes from the browser-safe attribute registry instead.
 */

export type { DeviceType } from '../attributes';

import type { DeviceType } from '../attributes';

/** Full device state as pushed to the "device" brick via deviceBrick.data.set */
export interface DeviceState {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
  /**
   * Kept as a loose record rather than mirroring the server's `MatterState`:
   * the typed schema lives in clusters.ts (zod, server-only) and a hand-kept
   * mirror would drift on every attribute addition. Views never branch on the
   * value types; they render through formatAttribute/summarizeState, which
   * take `unknown` by contract.
   */
  state: Record<string, unknown>;
  /** Commands the device's clusters actually support (drives tappability). */
  commands?: string[];
  /** For button endpoints of a composed device: the named parent's device id. */
  parentId?: string | null;
  /** For button endpoints: 1-based button number within the parent device. */
  button?: number | null;
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
  /** Set on button endpoints of a composed device (folded under the parent). */
  parentId?: string | null;
}

/** Data shape for the devices overview brick */
export interface DevicesData {
  devices: DeviceSummary[];
}
