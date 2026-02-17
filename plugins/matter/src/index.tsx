/**
 * Matter Plugin for BRIKA
 *
 * Provides Matter smart home device integration with persistent fabric storage.
 */

import { definePreferenceOptions } from '@brika/sdk';
import { log, onInit, onStop, onUninstall } from '@brika/sdk/lifecycle';
import { clearAllData } from '@brika/sdk/storage';
import { getMatterController } from './matter-controller';
import { deviceDiscovered, deviceStateChanged } from './sparks';

// ─── Actions (server-side, called from pages via useAction/callAction) ───────

import './actions';

// Pages are compiled by the hub via Bun.build() — no import needed here.

// ─── Sparks ──────────────────────────────────────────────────────────────────

export { deviceDiscovered, deviceStateChanged } from './sparks';

// ─── Blocks ──────────────────────────────────────────────────────────────────

export { matterCommand } from './blocks/command';

// ─── Bricks ──────────────────────────────────────────────────────────────────

export { devicesBrick } from './bricks/devices';
export { deviceBrick } from './bricks/device';

// ─── Dynamic Dropdown Options ────────────────────────────────────────────────

definePreferenceOptions('deviceId', () => {
  const devices = getMatterController().getCommissionedDevices();
  return devices.map((d) => ({ value: d.nodeId, label: d.name }));
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onInit(async () => {
  log.info('Matter plugin initializing...');
  const controller = getMatterController();
  await controller.start();

  // Wire device state changes to spark emissions
  controller.onDeviceStateChanged((device) => {
    const state: Record<string, string> = {};
    for (const [k, v] of Object.entries(device.state)) {
      state[k] = String(v);
    }
    deviceStateChanged.emit({
      nodeId: device.nodeId,
      name: device.name,
      deviceType: device.deviceType,
      online: device.online,
      state,
    });
  });

  // Wire device discovery to spark emissions
  controller.onDeviceDiscovered((device) => {
    deviceDiscovered.emit({
      nodeId: device.nodeId,
      name: device.name,
      deviceType: device.deviceType,
    });
  });

  log.info('Matter plugin initialized');
});

onStop(async () => {
  log.info('Matter plugin stopping...');
  await getMatterController().stop();
  log.info('Matter plugin stopped');
});

onUninstall(() => {
  log.info('Matter plugin uninstalling, clearing all data...');
  clearAllData();
});

log.info('Matter plugin loaded');
