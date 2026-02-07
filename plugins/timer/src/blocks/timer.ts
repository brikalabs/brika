import { defineReactiveBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { timerCompleted, timerStarted } from '../sparks';

export const timer = defineReactiveBlock(
  {
    id: 'timer',
    inputs: {
      trigger: input(z.generic(), { name: 'Trigger' }),
    },
    outputs: {
      completed: output(
        z.object({
          name: z.string(),
          duration: z.number(),
          triggeredAt: z.number(),
          completedAt: z.number(),
        }),
        { name: 'Completed' }
      ),
    },
    config: z.object({
      name: z.string().optional().describe('Timer name'),
      duration: z.duration(undefined, 'Duration to wait'),
    }),
  },
  ({ inputs, outputs, config }) => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      if (activeTimer) {
        clearTimeout(activeTimer);
      }

      const triggeredAt = Date.now();
      const name = config.name ?? 'timer';

      log.info(`Timer "${name}" started for ${config.duration}ms`);

      timerStarted.emit({
        name,
        duration: config.duration,
        triggeredAt,
      });

      activeTimer = setTimeout(() => {
        const completedAt = Date.now();
        log.info(`Timer "${name}" completed`);

        const result = {
          name,
          duration: config.duration,
          triggeredAt,
          completedAt,
        };

        timerCompleted.emit(result);
        outputs.completed.emit(result);
        activeTimer = null;
      }, config.duration);
    });

    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer);
        activeTimer = null;
      }
    };
  }
);
