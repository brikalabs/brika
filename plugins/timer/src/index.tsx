/**
 * Timer Plugin for BRIKA
 *
 * Provides timer functionality as reactive blocks, typed events (sparks),
 * and dashboard bricks.
 */

import { log, onStop } from '@brika/sdk/lifecycle';


// Blocks (workflow nodes)
export { countdown } from './blocks/countdown';
export { timer } from './blocks/timer';
// Bricks (dashboard UI)
export { cameraBrick } from './bricks/camera';
export { photoBrick } from './bricks/photo';
export { timersDashboard } from './bricks/timers-dashboard';
// Sparks (typed events)
export { countdownCompleted, countdownTick, timerCompleted, timerStarted } from './sparks';

// Lifecycle
onStop(() => {
  log.info('Timer plugin stopping');
});

log.info('Timer plugin loaded');
