/**
 * Timer Plugin for BRIKA
 *
 * Provides timer functionality as reactive blocks and typed events (sparks).
 */

import { defineReactiveBlock, defineSpark, input, log, onStop, output, z } from '@brika/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Sparks - Typed Events
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when a timer begins */
export const timerStarted = defineSpark({
  id: 'timer-started',
  schema: z.object({
    name: z.string(),
    duration: z.number(),
    triggeredAt: z.number(),
  }),
});

/** Emitted when a timer finishes */
export const timerCompleted = defineSpark({
  id: 'timer-completed',
  schema: z.object({
    name: z.string(),
    duration: z.number(),
    triggeredAt: z.number(),
    completedAt: z.number(),
  }),
});

/** Emitted on each countdown progress tick */
export const countdownTick = defineSpark({
  id: 'countdown-tick',
  schema: z.object({
    remaining: z.number(),
    total: z.number(),
    progress: z.number(),
  }),
});

/** Emitted when a countdown finishes */
export const countdownCompleted = defineSpark({
  id: 'countdown-completed',
  schema: z.object({
    total: z.number(),
  }),
});

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
  ({ inputs, outputs, config }) => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      // Cancel any existing timer
      if (activeTimer) {
        clearTimeout(activeTimer);
      }

      const triggeredAt = Date.now();
      const name = config.name ?? 'timer';

      log.info(`Timer "${name}" started for ${config.duration}ms`);

      // Emit spark when timer starts
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

        // Emit spark when timer completes
        timerCompleted.emit(result);

        outputs.completed.emit(result);
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

        // Emit spark on each tick
        countdownTick.emit(tickData);
        outputs.tick.emit(tickData);

        if (remaining <= 0) {
          stop();
          log.info('Countdown completed');

          // Emit spark when countdown completes
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

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

onStop(() => {
  log.info('Timer plugin stopping');
});

log.info('Timer plugin loaded');
