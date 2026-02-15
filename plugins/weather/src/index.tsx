import { log, onStop } from '@brika/sdk/lifecycle';

// Bricks (board UI)
export { currentBrick } from './bricks/current';
export { forecastBrick } from './bricks/forecast';
export { compactBrick } from './bricks/compact';

// Lifecycle
onStop(() => {
  log.info('Weather plugin stopping');
});

log.info('Weather plugin loaded');
