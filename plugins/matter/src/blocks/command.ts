import { defineBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { getMatterController } from '../matter-controller';

export const matterCommand = defineBlock({
  id: 'command',
  meta: {
    name: 'Matter Command',
    description: 'Send a command to a Matter device (on/off, level, color)',
    category: 'action',
    icon: 'cpu',
    color: '#6366f1',
  },
  inputs: {
    trigger: input(z.generic(), { name: 'Trigger' }),
  },
  outputs: {
    success: output(z.object({ nodeId: z.string(), command: z.string() }), { name: 'Success' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    nodeId: z.string().describe('Matter device node ID'),
    command: z
      .enum([
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
      ])
      .describe('Command to send'),
    params: z.record(z.string(), z.string()).optional().describe('Command parameters'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      try {
        const controller = getMatterController();
        const ok = await controller.sendCommand(config.nodeId, config.command, config.params);
        if (ok) {
          outputs.success.emit({ nodeId: config.nodeId, command: config.command });
        } else {
          outputs.error.emit({
            message: `Command "${config.command}" failed for device ${config.nodeId}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Matter command failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
});
