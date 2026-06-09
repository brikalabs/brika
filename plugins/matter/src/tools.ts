/**
 * Matter Plugin Tools
 *
 * Hub-wide, AI-discoverable capabilities (see {@link defineTool}). Where the
 * actions in `actions.ts` are called by this plugin's own pages, these tools are
 * registered in the global registry so an AI Agent, a voice assistant, a rule,
 * or the API can enumerate and call them by id alone. This is what lets an agent
 * asked "turn on the kitchen light" discover and actuate a Matter device at
 * runtime without any hard-coded knowledge of Matter.
 *
 * They wrap the same `MatterController` the actions use, so device control flows
 * through one code path.
 */

import { defineTool, z } from '@brika/sdk';
import { getMatterController } from './matter-controller';

// Source of truth for the commands a tool caller may send. The inferred union
// matches `MatterCommand`, so `sendCommand` accepts a parsed value without a cast.
const commandSchema = z.enum([
  'on',
  'off',
  'toggle',
  'setBrightness',
  'setColorTemp',
  'setHueSaturation',
  'lock',
  'unlock',
  'coverOpen',
  'coverClose',
  'coverStop',
  'setTargetTemp',
]);

/** Command parameters are stringly-typed (e.g. `{ level: "128" }`). */
const paramsSchema = z.record(z.string(), z.string());

defineTool(
  {
    id: 'list-devices',
    description:
      'List the commissioned Matter devices (lights, locks, covers, thermostats, switches, sensors) with their nodeId, name, type, and online state. Call this first to resolve a device name to the nodeId you pass to control-device.',
    icon: 'radio',
    color: '#7c3aed',
    inputSchema: { type: 'object', properties: {} },
  },
  () => {
    const controller = getMatterController();
    return {
      devices: controller.getCommissionedDevices().map((device) => ({
        nodeId: device.nodeId,
        name: device.name,
        type: device.deviceType,
        online: device.online,
      })),
    };
  }
);

defineTool(
  {
    id: 'control-device',
    description:
      'Control a commissioned Matter device by nodeId: turn a light on/off/toggle, lock/unlock, open/close/stop a cover, or set brightness/color/temperature. Resolve the nodeId with list-devices first.',
    icon: 'zap',
    color: '#7c3aed',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Target device nodeId (from list-devices)' },
        command: {
          type: 'string',
          enum: [...commandSchema.options],
          description: 'The command to send to the device',
        },
        args: {
          type: 'object',
          description: 'Optional string parameters, e.g. { "level": "128" } for setBrightness',
        },
      },
      required: ['nodeId', 'command'],
    },
  },
  async (args) => {
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
    if (!nodeId) {
      return 'Error: nodeId is required. Call list-devices to find it.';
    }
    const command = commandSchema.safeParse(args.command);
    if (!command.success) {
      return `Error: unknown command. Valid commands: ${commandSchema.options.join(', ')}`;
    }
    const params = paramsSchema.safeParse(args.args);

    const controller = getMatterController();
    // Models sometimes invent nodeIds ("light1") instead of resolving them.
    // Distinguish that from a real command failure so the caller can recover.
    const known = controller.getCommissionedDevices();
    if (!known.some((device) => device.nodeId === nodeId)) {
      const ids = known.map((device) => `${device.nodeId} (${device.name})`).join(', ');
      return `Error: unknown nodeId "${nodeId}". Call list-devices first and use one of the real nodeId values${ids ? `: ${ids}` : '.'}`;
    }
    const ok = await controller.sendCommand(
      nodeId,
      command.data,
      params.success ? params.data : undefined
    );
    return ok
      ? `Sent "${command.data}" to device ${nodeId}.`
      : `Command "${command.data}" failed on device ${nodeId} (device may be offline).`;
  }
);
