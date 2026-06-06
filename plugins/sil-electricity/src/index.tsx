import { getPreferences } from '@brika/sdk';
import {
  log,
  onBrickConfigChange,
  onInit,
  onPreferencesChange,
  onStop,
} from '@brika/sdk/lifecycle';
import { chartData, costData, liveData, summaryData } from './brick-data';
import { acquirePeriod, setCredentials, setPrices, stopAll, useElectricityStore } from './store';
import type { ElectricityState, Period } from './types';

interface SilPrefs {
  email?: string;
  password?: string;
  pricePerKwh?: number;
  injectionPricePerKwh?: number;
}

function pickPrices(p: SilPrefs): { perKwh: number; perInjection: number } {
  return {
    perKwh: typeof p.pricePerKwh === 'number' && p.pricePerKwh >= 0 ? p.pricePerKwh : 0.3,
    perInjection:
      typeof p.injectionPricePerKwh === 'number' && p.injectionPricePerKwh >= 0
        ? p.injectionPricePerKwh
        : 0.1,
  };
}

const VALID_PERIODS: Period[] = ['24h', '7d', '30d', '12m', '24m'];

function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (VALID_PERIODS as string[]).includes(value);
}

// ─── Push store updates to all brick types ──────────────────────────────────

/**
 * A push is "informative" if the bricks would render something concrete
 * from it: actual data, an explicit error, or a credentials-missing
 * banner. Loading-only states (`{loading:true, data:null, error:null}`)
 * carry no display value, and pushing them after a hot reload would
 * overwrite the UI's last-known-good cache and force every brick back
 * into its `<Loader/>` fallback for the duration of the next poll.
 */
function isInformative(state: ElectricityState): boolean {
  if (!state.credentialsSet) {
    return true;
  }
  for (const period of Object.values(state.periods)) {
    if (period?.data !== null || period?.error !== null) {
      return true;
    }
  }
  return false;
}

function pushState(): void {
  const state = useElectricityStore.get();
  if (!isInformative(state)) {
    return;
  }
  chartData.set(state);
  summaryData.set(state);
  liveData.set(state);
  costData.set(state);
}

// ─── Per-instance subscriptions for the chart brick ─────────────────────────

const instanceReleases = new Map<string, { period: Period; release: () => void }>();
const baseReleases: (() => void)[] = [];

function bindInstance(instanceId: string, config: Record<string, unknown>): void {
  if (!isPeriod(config.period)) {
    return;
  }
  const previous = instanceReleases.get(instanceId);
  if (previous?.period === config.period) {
    return;
  }

  if (previous) {
    previous.release();
  }
  instanceReleases.set(instanceId, {
    period: config.period,
    release: acquirePeriod(config.period),
  });
  log.info(`brick ${instanceId} bound to period ${config.period}`);
}

function applyPrefs(p: SilPrefs): void {
  // Trim both: a stray space or newline pasted into the password field (common
  // from password managers) makes SIL reject an otherwise-correct password as
  // "identifiants incorrects".
  setCredentials(p.email?.trim() ?? '', p.password?.trim() ?? '');
  setPrices(pickPrices(p));
}

// ─── Module-load setup ──────────────────────────────────────────────────────
// Subscribe and register event handlers synchronously so we never miss an
// event the hub fires immediately after the plugin process starts.

useElectricityStore.subscribe(pushState);

onBrickConfigChange((instanceId, config) => {
  bindInstance(instanceId, config);
  // Hand every freshly bound brick the current state right away, including the
  // summary/cost/live bricks that carry no per-instance period (so bindInstance
  // returns early for them) and ride the always-on base subscriptions. Without
  // this, a brick added onto an already-polling period gets no new poll, no
  // state change, and no push, so it would spin on its loader forever. The
  // isInformative guard means we only push when there is real data or an error.
  pushState();
});

onPreferencesChange<SilPrefs>(applyPrefs);

// ─── Plugin init (runs AFTER preferences are delivered) ────────────────────
// `getPreferences()` returns `{}` synchronously at module load, and the real
// values arrive later via the preferences IPC message, which fires `onInit`
// the first time. So we hold off setting credentials and starting polling
// until here.

onInit(async () => {
  applyPrefs(getPreferences<SilPrefs>());

  // Always-on subscriptions for bricks without per-instance config:
  // Live brick uses 24h, Summary brick uses 12m.
  baseReleases.push(acquirePeriod('24h'), acquirePeriod('12m'));
});

onStop(() => {
  for (const release of baseReleases) {
    release();
  }
  for (const { release } of instanceReleases.values()) {
    release();
  }
  instanceReleases.clear();
  baseReleases.length = 0;
  stopAll();
  log.info('SIL electricity plugin stopping');
});

log.info('SIL electricity plugin loaded');
