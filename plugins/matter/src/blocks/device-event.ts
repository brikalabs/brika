/**
 * "When Device Changes" trigger block.
 *
 * Subscribes directly to the in-process Matter controller (real matter.js
 * attribute events, no polling) and fires for the configured device:
 *
 *   - `changed-<i>` — one dynamic output per watched attribute, picked from a
 *     dropdown of the attributes Brika actually maps (no guessing names).
 *   - `event`       — Matter EVENTS: button presses on switches/dimmers
 *     (`initialPress`, `shortRelease`, `longPress`, `multiPressComplete`, ...),
 *     lock alarms, and similar one-shot signals that never appear in state.
 *   - `any`         — any state change (the full device snapshot).
 *
 * The device itself is picked from a dropdown of commissioned devices. All
 * subscriptions are cleaned up automatically when the block stops.
 */

import { defineBlock, output, z } from '@brika/sdk';
import {
  getMatterController,
  type MatterDevice,
  type MatterDeviceEvent,
} from '../matter-controller';

/**
 * Every attribute key the controller can map into `device.state`. This is the
 * closed vocabulary `#readEndpointState` produces; the dropdown offers exactly
 * these so users never have to guess attribute names.
 */
const WATCHABLE_ATTRIBUTES = [
  'on',
  'brightness',
  'hue',
  'saturation',
  'colorTempMireds',
  'colorMode',
  'locked',
  'lockState',
  'coverPosition',
  'coverOperational',
  'temperature',
  'humidity',
  'occupied',
  'contact',
  'illuminance',
  'battery',
  'buttonPosition',
  'systemMode',
  'systemModeName',
] as const;

function toStringState(device: MatterDevice): Record<string, string> {
  const state: Record<string, string> = {};
  for (const [k, v] of Object.entries(device.state)) {
    state[k] = String(v);
  }
  return state;
}

type Update = { kind: 'state'; device: MatterDevice } | { kind: 'event'; event: MatterDeviceEvent };

export const deviceEvent = defineBlock({
  id: 'device-event',
  meta: {
    name: 'When Device Changes',
    description:
      "Fires when a Matter device's attributes change or it emits an event (button press)",
    category: 'trigger',
    icon: 'radio',
    color: '#6366f1',
  },
  inputs: {},
  outputs: {
    // Template port: the editor renders one output per watched attribute.
    changed: output(
      z.object({
        attribute: z.string(),
        value: z.string(),
        nodeId: z.string(),
        name: z.string(),
      }),
      { name: 'Changed', repeat: 'attributes' }
    ),
    event: output(
      z.object({
        event: z.string(),
        nodeId: z.string(),
        name: z.string(),
        data: z.record(z.string(), z.string()),
      }),
      { name: 'Device event' }
    ),
    any: output(
      z.object({
        nodeId: z.string(),
        name: z.string(),
        deviceType: z.string(),
        online: z.boolean(),
        state: z.record(z.string(), z.string()),
      }),
      { name: 'Any change' }
    ),
  },
  config: z.object({
    nodeId: z.dynamicDropdown({
      label: 'Device',
      description: 'The commissioned Matter device to watch',
    }),
    attributes: z
      .array(z.object({ name: z.enum(WATCHABLE_ATTRIBUTES) }))
      .default([])
      .describe('Attributes to watch; each adds its own output'),
  }),
  run: ({ config, emit, start }) => {
    const controller = getMatterController();
    let prev: Record<string, string> = {};

    start<Update>((push) => {
      const unsubState = controller.onDeviceStateChanged((device) => {
        if (device.nodeId === config.nodeId) {
          push({ kind: 'state', device });
        }
      });
      const unsubEvent = controller.onDeviceEvent((event) => {
        if (event.nodeId === config.nodeId) {
          push({ kind: 'event', event });
        }
      });
      return () => {
        unsubState();
        unsubEvent();
      };
    }).on((update) => {
      if (update.kind === 'event') {
        emit('event', {
          event: update.event.event,
          nodeId: update.event.nodeId,
          name: update.event.name,
          data: update.event.data,
        });
        return;
      }

      const { device } = update;
      const state = toStringState(device);

      (config.attributes ?? []).forEach((attr, index) => {
        if (attr.name in state && state[attr.name] !== prev[attr.name]) {
          emit(`changed-${index}`, {
            attribute: attr.name,
            value: state[attr.name] ?? '',
            nodeId: device.nodeId,
            name: device.name,
          });
        }
      });

      prev = state;
      emit('any', {
        nodeId: device.nodeId,
        name: device.name,
        deviceType: device.deviceType,
        online: device.online,
        state,
      });
    });
  },
});
