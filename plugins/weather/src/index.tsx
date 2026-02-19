import { log, onStop } from '@brika/sdk/lifecycle';

export { compactBrick } from './bricks/compact';
// Bricks (board UI)
export { currentBrick } from './bricks/current';
export { forecastBrick } from './bricks/forecast';

// Lifecycle
onStop(() => {
  log.info('Weather plugin stopping');
});

log.info('Weather plugin loaded');
