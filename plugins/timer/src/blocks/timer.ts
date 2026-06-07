import { capture, defineBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { timerCompleted, timerStarted } from '../sparks';

export const timer = defineBlock({
  id: 'timer',
  meta: {
    name: 'Timer',
    description: 'Set a one-shot timer that fires after a duration',
    category: 'trigger',
    icon: 'timer',
    color: '#22c55e',
  },
  inputs: {
    trigger: input(z.generic()),
  },
  outputs: {
    completed: output(
      z.object({
        name: z.string(),
        duration: z.number(),
        triggeredAt: z.number(),
        completedAt: z.number(),
      })
    ),
  },
  config: z.object({
    name: z.string().optional().describe('Timer name'),
    duration: z.duration(undefined, 'Duration to wait'),
  }),
  run({ inputs, outputs, config }) {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      if (activeTimer) {
        clearTimeout(activeTimer);
      }

      const triggeredAt = Date.now();
      const name = config.name ?? 'timer';

      log.info(`Timer "${name}" started for ${config.duration}ms`);

      capture('timer.started', {
        hasName: config.name !== undefined,
        durationMs: config.duration,
      });

      timerStarted.emit({
        name,
        duration: config.duration,
        triggeredAt,
      });

      activeTimer = setTimeout(() => {
        const completedAt = Date.now();
        log.info(`Timer "${name}" completed`);

        capture('timer.completed', { durationMs: config.duration });

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
  },
});
