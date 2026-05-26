/**
 * Playground plugin — experimental sandbox.
 *
 * A reference implementation that bundles three small demos so first-party
 * SDK features can be exercised in one place:
 *
 *   1. `echo` reactive block (+ `echoed` spark)   — see blocks/echo.ts
 *   2. Preferences showcase (all input variants)  — see preferences.ts
 *   3. File-browser page                          — see pages/file-browser.tsx
 *      JSON + base64-binary operations via typed actions colocated with
 *      the page. All filesystem access is jailed to `/data` and goes
 *      through the grant runtime.
 *
 * The submodules below register themselves with the plugin runtime when
 * imported (side-effect-only). This file is the manifest — keep it small.
 */

import { log, onStop } from '@brika/sdk';

import './preferences';
import './blocks/echo';
import './pages/file-browser/actions';

export { echo, echoed } from './blocks/echo';
export {
  deleteEntry,
  listEntries,
  makeFolder,
  readEntry,
  writeEntry,
} from './pages/file-browser/actions';

onStop(() => {
  log.info('Playground plugin stopping');
});

log.info('Playground plugin loaded');
