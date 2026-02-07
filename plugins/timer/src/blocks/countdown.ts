import { defineReactiveBlock, input, output, z } from '@brika/sdk';
import { log } from '@brika/sdk/lifecycle';
import { countdownCompleted, countdownTick } from '../sparks';

export const countdown = defineReactiveBlock(
  {
    id: 'countdown',
    inputs: {
      start: input(z.generic(), { name: 'Start' }),
      cancel: input(z.generic(), { name: 'Cancel' }),
    },
    outputs: {
      tick: output(
        z.object({
          remaining: z.number(),
          total: z.number(),
          progress: z.number(),
        }),
        { name: 'Tick' }
      ),
      completed: output(z.object({ total: z.number() }), { name: 'Completed' }),
      cancelled: output(z.object({ remaining: z.number() }), { name: 'Cancelled' }),
    },
    config: z.object({
      duration: z.duration(undefined, 'Total countdown duration'),
      tickInterval: z.duration(undefined, 'Interval between ticks').default(1000),
    }),
  },
  ({ inputs, outputs, config }) => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let endTime = 0;

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    inputs.start.on(() => {
      stop();
      endTime = Date.now() + config.duration;
      log.info(`Countdown started: ${config.duration}ms`);

      intervalId = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const progress = 1 - remaining / config.duration;

        const tickData = {
          remaining,
          total: config.duration,
          progress,
        };

        countdownTick.emit(tickData);
        outputs.tick.emit(tickData);

        if (remaining <= 0) {
          stop();
          log.info('Countdown completed');

          countdownCompleted.emit({ total: config.duration });
          outputs.completed.emit({ total: config.duration });
        }
      }, config.tickInterval);
    });

    inputs.cancel.on(() => {
      if (intervalId) {
        const remaining = Math.max(0, endTime - Date.now());
        stop();
        log.info(`Countdown cancelled with ${remaining}ms remaining`);
        outputs.cancelled.emit({ remaining });
      }
    });

    return stop;
  }
);
