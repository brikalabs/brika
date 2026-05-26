/**
 * Per-period polling: refcounted subscriptions, fixed cadences, automatic
 * re-auth on session expiry.
 */

import { log } from '@brika/sdk/lifecycle';
import { fetchConsumption, granularityForPeriod } from '../api';
import type { ConsumptionData, Period } from '../types';
import { authenticate, clearSession, getCredentials, getSessionCookie } from './auth';
import { patchPeriod } from './store';

const POLL_MS_BY_PERIOD: Record<Period, number> = {
  '24h': 5 * 60 * 1000,
  '7d': 30 * 60 * 1000,
  '30d': 60 * 60 * 1000,
  '12m': 60 * 60 * 1000,
  '24m': 60 * 60 * 1000,
};

interface Entry {
  refCount: number;
  timer: ReturnType<typeof setInterval> | null;
}

const entries = new Map<Period, Entry>();

async function fetchAndStore(period: Period): Promise<void> {
  const points = await fetchConsumption(getSessionCookie(), period);
  const data: ConsumptionData = {
    points,
    granularity: granularityForPeriod(period),
    period,
    lastUpdated: Date.now(),
  };
  patchPeriod(period, { data, loading: false, error: null });
}

export async function pollPeriod(period: Period): Promise<void> {
  patchPeriod(period, { loading: true, error: null });

  if (!getCredentials()) {
    patchPeriod(period, { loading: false, error: 'auth' });
    return;
  }

  if (!getSessionCookie() && !(await authenticate())) {
    patchPeriod(period, { loading: false, error: 'auth' });
    return;
  }

  try {
    await fetchAndStore(period);
  } catch (err) {
    await handleFetchError(period, err);
  }
}

/** Auth-failed → clear session, log in again, retry once. */
async function handleFetchError(period: Period, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);

  if (message !== 'AUTH_FAILED') {
    log.error(`SIL poll[${period}] failed: ${message}`);
    patchPeriod(period, { loading: false, error: 'network' });
    return;
  }

  clearSession();
  if (!(await authenticate())) {
    patchPeriod(period, { loading: false, error: 'auth' });
    return;
  }

  try {
    await fetchAndStore(period);
  } catch (retryErr) {
    log.error(
      `SIL poll[${period}] retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
    );
    patchPeriod(period, { loading: false, error: 'network' });
  }
}

/**
 * Subscribe to a period. The first subscriber kicks off polling; the last
 * release stops the timer. Returns a release function.
 */
export function acquirePeriod(period: Period): () => void {
  let entry = entries.get(period);
  if (!entry) {
    entry = { refCount: 0, timer: null };
    entries.set(period, entry);
  }
  entry.refCount++;

  if (entry.refCount === 1) {
    // Mark loading immediately so bricks have a defined state to render.
    patchPeriod(period, { loading: true, error: null });
    if (getCredentials()) {
      pollPeriod(period);
    }
    entry.timer = setInterval(() => pollPeriod(period), POLL_MS_BY_PERIOD[period]);
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const e = entries.get(period);
    if (!e) {
      return;
    }
    e.refCount--;
    if (e.refCount <= 0) {
      if (e.timer) {
        clearInterval(e.timer);
      }
      entries.delete(period);
    }
  };
}

export function activePeriods(): IterableIterator<Period> {
  return entries.keys();
}

export function stopAllPolling(): void {
  for (const entry of entries.values()) {
    if (entry.timer) {
      clearInterval(entry.timer);
    }
  }
  entries.clear();
}
