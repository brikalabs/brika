import { z } from '@brika/sdk';
import { defineSpark } from '@brika/sdk/sparks';

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
