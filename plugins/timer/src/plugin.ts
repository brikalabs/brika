/**
 * Timer plugin lifecycle.
 *
 * Blocks, sparks, and bricks are discovered by `brika build` (which generates
 * `src/_generated/entry.ts`); this file holds only runtime setup.
 */

import { log, onStop } from '@brika/sdk/lifecycle';
import { dashboardData } from './brick-data';

const startedAt = Date.now();

dashboardData.set({
  blockCount: 2,
  sparkCount: 4,
  startedAt,
});

onStop(() => {
  log.info('Timer plugin stopping');
});

log.info('Timer plugin loaded');
