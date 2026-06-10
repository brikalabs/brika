/**
 * Matter Plugin for BRIKA
 *
 * Provides Matter smart home device integration with persistent fabric storage.
 */

import { definePreferenceOptions } from '@brika/sdk';
import { log, onInit, onStop, onUninstall } from '@brika/sdk/lifecycle';
import { clearAllData } from '@brika/sdk/storage';
import { deviceBrick } from './bricks/device.brick';
import { devicesBrick } from './bricks/devices.brick';
import { getMatterController } from './matter-controller';
import { serializeDevice } from './serialize';
import {
  attributeChanged,
  deviceDiscovered,
  deviceOffline,
  deviceOnline,
  deviceStateChanged,
} from './sparks';

// ─── Actions (server-side, called from pages and client bricks) ─────────────

import './actions';

// ─── Tools (hub-wide, AI-discoverable: list-devices, control-device) ────────

import './tools';

// Pages are compiled by the hub via Bun.build() — no import needed here.

// ─── Sparks ──────────────────────────────────────────────────────────────────

export {
  attributeChanged,
  deviceDiscovered,
  deviceOffline,
  deviceOnline,
  deviceStateChanged,
} from './sparks';

// ─── Blocks ──────────────────────────────────────────────────────────────────

export { buttonPress } from './blocks/button-press';
export { matterCommand } from './blocks/command';
export { deviceEvent } from './blocks/device-event';

// ─── Bricks ──────────────────────────────────────────────────────────────────

// Both bricks are client-rendered — no server-side defineBrick export needed.
// Brick types are registered from package.json metadata.

// ─── Dynamic Dropdown Options ────────────────────────────────────────────────

definePreferenceOptions('deviceId', () => {
  const devices = getMatterController().getCommissionedDevices();
  return devices.map((d) => ({ value: d.nodeId, label: d.name }));
});

// Device picker for the "When Device Changes" block (config key `nodeId`).
// Same devices as `deviceId`, with the type and online state surfaced so a
// user can tell two same-named devices apart without knowing Matter ids.
definePreferenceOptions('nodeId', () => {
  const devices = getMatterController().getCommissionedDevices();
  return devices.map((d) => ({
    value: d.nodeId,
    label: `${d.name} (${d.deviceType})`,
    description: d.online ? `online, ${d.nodeId}` : `offline, ${d.nodeId}`,
  }));
});

// ─── Client-side data push ──────────────────────────────────────────────────

/** Push the full device list to the "devices" brick */
function pushDevicesData() {
  const controller = getMatterController();
  const devices = controller.getDevices().map(serializeDevice);
  devicesBrick.data.set({ devices });
}

/** Push the device map to the "device" brick (all devices keyed by nodeId) */
function pushDeviceData() {
  const controller = getMatterController();
  const devices = controller.getDevices();
  const deviceMap: Record<string, ReturnType<typeof serializeDevice>> = {};
  for (const d of devices) {
    deviceMap[d.nodeId] = serializeDevice(d);
  }
  deviceBrick.data.set({ deviceMap });
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

  // Wire device state changes to spark emissions + brick data push. We diff
  // each real event against the last snapshot to emit granular, typed sparks
  // (online/offline + per-attribute) on top of the catch-all state spark.
  const prevByNode = new Map<string, { online: boolean; state: Record<string, string> }>();

  controller.onDeviceStateChanged((device) => {
    const now = Date.now();
    const state: Record<string, string> = {};
    for (const [k, v] of Object.entries(device.state)) {
      state[k] = String(v);
    }

    const prev = prevByNode.get(device.nodeId);
    const base = { nodeId: device.nodeId, name: device.name, deviceType: device.deviceType };

    // Online/offline transitions.
    if (prev && prev.online !== device.online) {
      (device.online ? deviceOnline : deviceOffline).emit({ ...base, timestamp: now });
    }

    // Per-attribute changes (skip the very first snapshot, nothing to diff).
    if (prev) {
      for (const [attribute, value] of Object.entries(state)) {
        if (prev.state[attribute] !== value) {
          attributeChanged.emit({ ...base, attribute, value, timestamp: now });
        }
      }
    }

    prevByNode.set(device.nodeId, { online: device.online, state });

    // Catch-all spark (kept for back-compat / "any change" consumers).
    deviceStateChanged.emit({ ...base, online: device.online, state });

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
