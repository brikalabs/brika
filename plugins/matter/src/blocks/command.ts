import { defineReactiveBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { getMatterController, type MatterCommand } from '../matter-controller';

export const matterCommand = defineReactiveBlock(
  {
    id: 'command',
    inputs: {
      trigger: input(z.generic(), { name: 'Trigger' }),
    },
    outputs: {
      success: output(
        z.object({ nodeId: z.string(), command: z.string() }),
        { name: 'Success' },
      ),
      error: output(
        z.object({ message: z.string() }),
        { name: 'Error' },
      ),
    },
    config: z.object({
      nodeId: z.string().describe('Matter device node ID'),
      command: z
        .enum(['on', 'off', 'toggle', 'setBrightness', 'setColorTemp'])
        .describe('Command to send'),
      params: z.record(z.string(), z.string()).optional().describe('Command parameters'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      try {
        const controller = getMatterController();
        const ok = await controller.sendCommand(
          config.nodeId,
          config.command as MatterCommand,
          config.params,
        );
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
);
