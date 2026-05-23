/**
 * Public store API.
 *
 * Other modules subscribe to `useElectricityStore` and call:
 *   - `setCredentials` once on plugin start (and on prefs change)
 *   - `acquirePeriod(period)` per brick instance to start polling
 *   - `stopAll()` on plugin stop
 */

import { updateCredentials } from './auth';
import { activePeriods, pollPeriod, stopAllPolling } from './polling';
import { resetState, setCredentialsKnown } from './store';

export { acquirePeriod } from './polling';
export { setPrices, useElectricityStore } from './store';

export function setCredentials(email: string, password: string): void {
  const changed = updateCredentials(email, password);
  setCredentialsKnown(Boolean(email && password));

  if (!email || !password) {
    resetState();
    return;
  }

  if (changed) {
    // Re-poll every active period so bricks see fresh data with the new creds.
    for (const period of activePeriods()) {
      pollPeriod(period);
    }
  }
}

export function stopAll(): void {
  stopAllPolling();
  updateCredentials('', '');
}
