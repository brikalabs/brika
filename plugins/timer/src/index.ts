/**
 * Timer Plugin for BRIKA
 *
 * Provides timer functionality as reactive blocks.
 */

import { defineReactiveBlock, input, log, onStop, output, z } from '@brika/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Timer Block - Set a one-shot timer
// ─────────────────────────────────────────────────────────────────────────────

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
  ({ inputs, outputs, config, log }) => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      // Cancel any existing timer
      if (activeTimer) {
        clearTimeout(activeTimer);
      }

      const triggeredAt = Date.now();
      const name = config.name ?? 'timer';

      log('info', `Timer "${name}" started for ${config.duration}ms`);

      activeTimer = setTimeout(() => {
        const completedAt = Date.now();
        log('info', `Timer "${name}" completed`);
        outputs.completed.emit({
          name,
          duration: config.duration,
          triggeredAt,
          completedAt,
        });
        activeTimer = null;
      }, config.duration);
    });

    // Cleanup on block stop
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer);
        activeTimer = null;
      }
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Countdown Block - Emit progress during countdown
// ─────────────────────────────────────────────────────────────────────────────

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
  ({ inputs, outputs, config, log }) => {
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
      log('info', `Countdown started: ${config.duration}ms`);

      intervalId = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const progress = 1 - remaining / config.duration;

        outputs.tick.emit({
          remaining,
          total: config.duration,
          progress,
        });

        if (remaining <= 0) {
          stop();
          log('info', 'Countdown completed');
          outputs.completed.emit({ total: config.duration });
        }
      }, config.tickInterval);
    });

    inputs.cancel.on(() => {
      if (intervalId) {
        const remaining = Math.max(0, endTime - Date.now());
        stop();
        log('info', `Countdown cancelled with ${remaining}ms remaining`);
        outputs.cancelled.emit({ remaining });
      }
    });

    return stop;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

onStop(() => {
  log('info', 'Timer plugin stopping');
});

log('info', 'Timer plugin loaded');
