/**
 * Matter Plugin for BRIKA
 *
 * Provides Matter smart home device integration with persistent fabric storage.
 */

import { definePreferenceOptions, setBrickData } from '@brika/sdk';
import { log, onInit, onStop, onUninstall } from '@brika/sdk/lifecycle';
import { clearAllData } from '@brika/sdk/storage';
import { getMatterController } from './matter-controller';
import { serializeDevice } from './serialize';
import { deviceDiscovered, deviceStateChanged } from './sparks';

// ─── Actions (server-side, called from pages and client bricks) ─────────────

import './actions';

// Pages are compiled by the hub via Bun.build() — no import needed here.

// ─── Sparks ──────────────────────────────────────────────────────────────────

export { deviceDiscovered, deviceStateChanged } from './sparks';

// ─── Blocks ──────────────────────────────────────────────────────────────────

export { matterCommand } from './blocks/command';

// ─── Bricks ──────────────────────────────────────────────────────────────────

// Both bricks are client-rendered — no server-side defineBrick export needed.
// Brick types are registered from package.json metadata.

// ─── Dynamic Dropdown Options ────────────────────────────────────────────────

definePreferenceOptions('deviceId', () => {
  const devices = getMatterController().getCommissionedDevices();
  return devices.map((d) => ({ value: d.nodeId, label: d.name }));
});

// ─── Client-side data push ──────────────────────────────────────────────────

/** Push the full device list to the "devices" brick */
function pushDevicesData() {
  const controller = getMatterController();
  const devices = controller.getDevices().map(serializeDevice);
  setBrickData('devices', { devices });
}

/** Push the device map to the "device" brick (all devices keyed by nodeId) */
function pushDeviceData() {
  const controller = getMatterController();
  const devices = controller.getDevices();
  const deviceMap: Record<string, ReturnType<typeof serializeDevice>> = {};
  for (const d of devices) {
    deviceMap[d.nodeId] = serializeDevice(d);
  }
  setBrickData('device', { deviceMap });
}

/** Push data for both brick types */
function pushAllBrickData() {
  pushDevicesData();
  pushDeviceData();
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onInit(async () => {
  log.info('Matter plugin initializing...');
  const controller = getMatterController();
  await controller.start();

  // Wire device state changes to spark emissions + brick data push
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

    // Push updated data to client bricks
    pushAllBrickData();
  });

  // Wire device discovery to spark emissions + brick data push
  controller.onDeviceDiscovered((device) => {
    deviceDiscovered.emit({
      nodeId: device.nodeId,
      name: device.name,
      deviceType: device.deviceType,
    });

    // Push updated data to client bricks
    pushAllBrickData();
  });

  // Push initial data now that controller is ready
  pushAllBrickData();

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
