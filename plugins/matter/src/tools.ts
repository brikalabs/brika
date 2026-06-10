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
import { getClusterCommand } from './clusters';
import { getMatterController, MATTER_COMMAND_VALUES } from './matter-controller';

// Source of truth for the commands a tool caller may send. The tuple comes
// straight from the cluster registry, so the inferred union IS `MatterCommand`
// and `sendCommand` accepts a parsed value without a cast.
const commandSchema = z.enum(MATTER_COMMAND_VALUES);

/** Command parameters are stringly-typed (e.g. `{ level: "128" }`). */
const paramsSchema = z.record(z.string(), z.string());

defineTool(
  {
    id: 'list-devices',
    description:
      'List the commissioned Matter devices (lights, locks, covers, thermostats, switches, ' +
      'sensors) with their nodeId, name, type, online flag, current state (on, brightness, ' +
      'temperature, battery, ...), and the exact commands each device supports. Call this ' +
      'first: it tells you both WHICH device to target and WHAT it can do.',
    icon: 'radio',
    color: '#7c3aed',
    input: z.object({}),
  },
  () => {
    const controller = getMatterController();
    return {
      devices: controller.getCommissionedDevices().map((device) => ({
        nodeId: device.nodeId,
        name: device.name,
        type: device.deviceType,
        online: device.online,
        state: device.state,
        commands: device.commands,
      })),
    };
  }
);

defineTool(
  {
    id: 'get-device-state',
    description:
      'Read one Matter device by nodeId: full current state (on, brightness, hue, saturation, ' +
      'colorTempMireds, locked, coverPosition, temperature, humidity, occupied, contact, ' +
      'illuminance, battery, ...), supported commands, and metadata. Use after control-device ' +
      'to confirm an action took effect.',
    icon: 'eye',
    color: '#7c3aed',
    input: z.object({
      nodeId: z.string().min(1).describe('Device nodeId (from list-devices)'),
    }),
  },
  ({ nodeId }) => {
    const controller = getMatterController();
    const device = controller.getCommissionedDevices().find((d) => d.nodeId === nodeId);
    if (!device) {
      const ids = controller
        .getCommissionedDevices()
        .map((d) => `${d.nodeId} (${d.name})`)
        .join(', ');
      return `Error: unknown nodeId "${nodeId}". Known devices: ${ids || 'none'}.`;
    }
    return {
      nodeId: device.nodeId,
      name: device.name,
      type: device.deviceType,
      online: device.online,
      state: device.state,
      commands: device.commands,
      vendor: device.vendor,
      product: device.product,
    };
  }
);

defineTool(
  {
    id: 'control-device',
    description:
      'Control commissioned Matter devices by nodeId: turn a light on/off/toggle, lock/unlock, ' +
      'open/close/stop a cover, set brightness/color/temperature, drive a fan, or run a robot ' +
      "vacuum. Resolve nodeIds with list-devices first; it also lists each device's supported " +
      'commands. To send the same command to several devices (e.g. turn off ALL lights), pass ' +
      'every nodeId in `nodeIds` in ONE call instead of calling once per device. Args use human ' +
      'units: setBrightness { "brightness": "0-100" }, setColorTemp { "kelvin": "2000-6500" }, ' +
      'setHueSaturation { "hue": "0-360", "saturation": "0-100" }, setFanSpeed ' +
      '{ "speed": "0-100" }, setCoverPosition { "position": "0-100" }.',
    icon: 'zap',
    color: '#7c3aed',
    input: z.object({
      nodeId: z
        .string()
        .min(1)
        .optional()
        .describe('Single target device nodeId (from list-devices)'),
      nodeIds: z
        .array(z.string().min(1))
        .optional()
        .describe('Several target nodeIds; the command is sent to each one'),
      command: commandSchema.describe('The command to send to the device(s)'),
      args: paramsSchema
        .optional()
        .describe(
          'Command parameters in human units: brightness 0-100, kelvin 2000-6500, hue 0-360, saturation 0-100'
        ),
    }),
  },
  async ({ nodeId, nodeIds, command, args }) => {
    let targets: string[] = [];
    if (nodeIds?.length) {
      targets = nodeIds;
    } else if (nodeId) {
      targets = [nodeId];
    }
    if (targets.length === 0) {
      return 'Error: provide nodeId (one device) or nodeIds (several devices).';
    }
    const controller = getMatterController();
    // Models sometimes invent nodeIds ("light1") instead of resolving them.
    // Distinguish that from a real command failure so the caller can recover.
    const known = controller.getCommissionedDevices();
    const unknown = targets.filter((id) => !known.some((device) => device.nodeId === id));
    if (unknown.length > 0) {
      const badIds = unknown.map((id) => `"${id}"`).join(', ');
      const ids = known.map((device) => `${device.nodeId} (${device.name})`).join(', ');
      const hint = ids ? `: ${ids}` : '.';
      return `Error: unknown nodeId(s) ${badIds}. Call list-devices first and use the real nodeId values${hint}`;
    }
    // Refuse commands a device's clusters don't implement, with the supported
    // set in the error so the model can self-correct instead of retrying.
    // A device with NO commands at all (battery remote, sensor) is called out
    // explicitly; the old fallthrough sent the command anyway and surfaced a
    // misleading "device may be offline" failure.
    const unsupported = targets
      .map((id) => known.find((device) => device.nodeId === id))
      .filter((device) => device !== undefined)
      .filter((device) => !device.commands.includes(command));
    if (unsupported.length > 0) {
      const detail = unsupported
        .map((device) =>
          device.commands.length === 0
            ? `${device.nodeId} (${device.name}) has no controllable functions (battery remote or sensor); react to it with device events instead`
            : `${device.nodeId} (${device.name}) supports: ${device.commands.join(', ')}`
        )
        .join('; ');
      return `Error: "${command}" is not supported by ${detail}`;
    }
    // Commands with a human-units surface carry their zod contract in the
    // cluster registry: validate there (friendly error on bad ranges so the
    // model can self-correct) and convert to raw Matter units. Commands
    // without one pass args through unchanged.
    const argsSpec = getClusterCommand(command)?.args;
    let rawArgs = args;
    if (argsSpec) {
      const converted = argsSpec.convert(args);
      if (!converted.ok) {
        return `Error: invalid arguments for "${command}": ${converted.error}.`;
      }
      rawArgs = converted.raw;
    }
    const lines: string[] = [];
    for (const id of targets) {
      const ok = await controller.sendCommand(id, command, rawArgs);
      lines.push(
        ok
          ? `Sent "${command}" to device ${id}.`
          : `Command "${command}" failed on device ${id} (device may be offline).`
      );
    }
    return lines.join('\n');
  }
);
