/**
 * Matter Plugin Actions
 *
 * Server-side actions callable from plugin pages via useAction/callAction.
 */

import { defineAction } from '@brika/sdk';
import { type MatterCommand, getMatterController } from './matter-controller';
import { serializeDevice } from './serialize';

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
export const command = defineAction(async (input: { nodeId: string; command: string; params?: Record<string, string> }) => {
  const controller = getMatterController();
  const ok = await controller.sendCommand(input.nodeId, input.command as MatterCommand, input.params);
  if (!ok) throw new Error('Command failed');
  return { ok };
});

/** Decommission and remove a device */
export const remove = defineAction(async (input: { nodeId: string }) => {
  const controller = getMatterController();
  const ok = await controller.removeDevice(input.nodeId);
  if (!ok) throw new Error('Device not found');
  return { ok };
});
