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

/**
 * Translate human-friendly tool args into the raw units `sendCommand` expects.
 * The tool surface speaks percent/degrees/kelvin (what models and people use);
 * the controller speaks Matter raw units (level 0-254, hue 0-254, mireds).
 */
function toRawArgs(
  command: string,
  args: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (command === 'setBrightness') {
    const pct = Number(args?.brightness ?? args?.level ?? 100);
    const clamped = Math.max(0, Math.min(100, pct));
    return { level: String(Math.round((clamped / 100) * 254)) };
  }
  if (command === 'setColorTemp') {
    const kelvin = args?.kelvin === undefined ? undefined : Number(args.kelvin);
    const mireds = kelvin ? Math.round(1_000_000 / kelvin) : Number(args?.mireds ?? 370);
    return { mireds: String(mireds) };
  }
  if (command === 'setHueSaturation') {
    const hueDeg = Math.max(0, Math.min(360, Number(args?.hue ?? 0)));
    const satPct = Math.max(0, Math.min(100, Number(args?.saturation ?? 100)));
    return {
      hue: String(Math.round((hueDeg / 360) * 254)),
      saturation: String(Math.round((satPct / 100) * 254)),
    };
  }
  if (command === 'setFanSpeed') {
    // Human percent IS the raw Matter unit (percentSetting); clamp and pass through.
    const speed = Math.max(0, Math.min(100, Number(args?.speed ?? 0)));
    return { speed: String(Math.round(speed)) };
  }
  if (command === 'setCoverPosition') {
    // Human percent IS the raw Matter unit (lift percentage); clamp and pass through.
    const position = Math.max(0, Math.min(100, Number(args?.position ?? 0)));
    return { position: String(Math.round(position)) };
  }
  return args;
}

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
    const unsupported = targets
      .map((id) => known.find((device) => device.nodeId === id))
      .filter((device) => device !== undefined)
      .filter((device) => device.commands.length > 0 && !device.commands.includes(command));
    if (unsupported.length > 0) {
      const detail = unsupported
        .map(
          (device) => `${device.nodeId} (${device.name}) supports: ${device.commands.join(', ')}`
        )
        .join('; ');
      return `Error: "${command}" is not supported by ${detail}`;
    }
    const rawArgs = toRawArgs(command, args);
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
