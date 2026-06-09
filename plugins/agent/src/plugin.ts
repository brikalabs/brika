/**
 * AI Agent plugin lifecycle.
 *
 * Blocks are discovered by `brika build` (which generates
 * `src/_generated/entry.ts`); this file holds only runtime setup.
 */

import { log, onStop } from '@brika/sdk/lifecycle';

onStop(() => {
  log.info('AI Agent plugin stopping');
});

log.info('AI Agent plugin loaded');
