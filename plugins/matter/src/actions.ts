/**
 * Matter Plugin Actions
 *
 * Server-side actions callable from plugin pages and client-rendered bricks.
 * The module compiler transforms action imports into lightweight refs at build time.
 */

import { defineAction } from '@brika/sdk/actions';
import { getMatterController, type MatterCommand } from './matter-controller';
import { serializeDevice } from './serialize';

/**
 * Compact device list for selector UIs (block config views, dynamic dropdowns).
 * Returns one entry per commissioned device with a stable `value` (nodeId) and a
 * human `label`, plus the device type and online flag so the picker can render a
 * matching icon and status dot.
 */
export const listDevices = defineAction(async () => {
  const controller = getMatterController();
  return controller.getCommissionedDevices().map((d) => ({
    value: d.nodeId,
    label: d.name,
    deviceType: d.deviceType,
    online: d.online,
  }));
});

/** Get all commissioned devices */
export const getDevices = defineAction(async () => {
  const controller = getMatterController();
  return {
    devices: controller.getDevices().map(serializeDevice),
    commissioned: controller.getCommissionedDevices().map(serializeDevice),
  };
});

/** Trigger network discovery (~10s blocking) */
export const scan = defineAction(async () => {
  const controller = getMatterController();
  const discovered = await controller.discover();
  return { discovered: discovered.map(serializeDevice) };
});

/** Commission a device with pairing code */
export const commission = defineAction(async (input: { pairingCode: string }) => {
  const controller = getMatterController();
  const nodeId = await controller.commission(input.pairingCode);
  const device = controller.getDevice(nodeId);
  return { nodeId, device: device ? serializeDevice(device) : null };
});

/** Send command to a device */
export const command = defineAction(
  async (input: { nodeId: string; command: string; params?: Record<string, string> }) => {
    const controller = getMatterController();
    const ok = await controller.sendCommand(
      input.nodeId,
      input.command as MatterCommand,
      input.params
    );
    if (!ok) {
      throw new Error('Command failed');
    }
    return { ok };
  }
);

/** Decommission and remove a device */
export const remove = defineAction(async (input: { nodeId: string }) => {
  const controller = getMatterController();
  const ok = await controller.removeDevice(input.nodeId);
  if (!ok) {
    throw new Error('Device not found');
  }
  return { ok };
});

// ─── Brick Actions (called from client-rendered bricks via callAction) ──────

/** Send a command to a Matter device from a client brick */
export const doDeviceCommand = defineAction(
  async (input: { nodeId: string; command: string; args?: Record<string, string> }) => {
    const controller = getMatterController();
    const ok = await controller.sendCommand(
      input.nodeId,
      input.command as MatterCommand,
      input.args
    );
    if (!ok) {
      throw new Error(`Command "${input.command}" failed on device ${input.nodeId}`);
    }
    return { ok };
  }
);
