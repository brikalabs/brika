/**
 * "When Device Changes" trigger block.
 *
 * Subscribes directly to the in-process Matter controller (real matter.js
 * attribute events, no polling) and fires for the configured device. Each
 * watched attribute gets its own dynamic output port (`changed-<i>`), plus an
 * `any` port for any change. The subscription is cleaned up automatically when
 * the block stops.
 */

import { defineReactiveBlock, output, z } from '@brika/sdk';
import { getMatterController, type MatterDevice } from '../matter-controller';

function toStringState(device: MatterDevice): Record<string, string> {
  const state: Record<string, string> = {};
  for (const [k, v] of Object.entries(device.state)) {
    state[k] = String(v);
  }
  return state;
}

export const deviceEvent = defineReactiveBlock(
  {
    id: 'device-event',
    name: 'When Device Changes',
    description: "Fires when a Matter device's watched attributes change",
    category: 'trigger',
    icon: 'radio',
    color: '#6366f1',
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
      nodeId: z.string().describe('Matter device to watch'),
      attributes: z
        .array(z.object({ name: z.string() }))
        .default([])
        .describe('Attributes to watch; each adds its own output'),
    }),
  },
  ({ config, emit, start }) => {
    const controller = getMatterController();
    let prev: Record<string, string> = {};

    start<MatterDevice>((push) =>
      controller.onDeviceStateChanged((device) => {
        if (device.nodeId === config.nodeId) {
          push(device);
        }
      })
    ).on((device) => {
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
  }
);
