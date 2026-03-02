/**
 * Timer Plugin for BRIKA
 *
 * Provides timer functionality as reactive blocks, typed events (sparks),
 * and dashboard bricks.
 */

import { setBrickData } from '@brika/sdk';
import { log, onStop } from '@brika/sdk/lifecycle';


// Blocks (workflow nodes)
export { countdown } from './blocks/countdown';
export { timer } from './blocks/timer';
// Bricks are client-rendered — no server-side defineBrick exports needed.
// Brick types are registered from package.json metadata.

// Sparks (typed events)
export { countdownCompleted, countdownTick, timerCompleted, timerStarted } from './sparks';

// ─── Client-side data push for timers-dashboard ─────────────────────────────

const startedAt = Date.now();

function pushDashboardData() {
  setBrickData('timers-dashboard', {
    blockCount: 2,
    sparkCount: 4,
    startedAt,
  });
}

// Push initial data
pushDashboardData();

// Lifecycle
onStop(() => {
  log.info('Timer plugin stopping');
});

log.info('Timer plugin loaded');
