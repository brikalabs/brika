/**
 * Timer plugin lifecycle.
 *
 * Blocks, sparks, and bricks are discovered by `brika build` (which generates
 * `src/_generated/entry.ts`); this file holds only runtime setup.
 */

import { log, onStop } from '@brika/sdk/lifecycle';
import { timersDashboard } from './bricks/timers-dashboard.brick';

const startedAt = Date.now();

timersDashboard.data.set({
  blockCount: 2,
  sparkCount: 4,
  startedAt,
});

onStop(() => {
  log.info('Timer plugin stopping');
});

log.info('Timer plugin loaded');
