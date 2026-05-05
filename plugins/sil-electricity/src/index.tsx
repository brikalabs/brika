import { getPreferences, setBrickData } from '@brika/sdk';
import {
  log,
  onBrickConfigChange,
  onInit,
  onPreferencesChange,
  onStop,
} from '@brika/sdk/lifecycle';
import {
  acquirePeriod,
  setCredentials,
  setPrices,
  stopAll,
  useElectricityStore,
} from './store';
import type { Period } from './types';

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

function pushState(): void {
  const state = useElectricityStore.get();
  setBrickData('chart', state);
  setBrickData('summary', state);
  setBrickData('live', state);
  setBrickData('cost', state);
}

// ─── Per-instance subscriptions for the chart brick ─────────────────────────

const instanceReleases = new Map<string, { period: Period; release: () => void }>();
const baseReleases: (() => void)[] = [];

function bindInstance(instanceId: string, config: Record<string, unknown>): void {
  if (!isPeriod(config.period)) return;
  const previous = instanceReleases.get(instanceId);
  if (previous?.period === config.period) return;

  if (previous) previous.release();
  instanceReleases.set(instanceId, {
    period: config.period,
    release: acquirePeriod(config.period),
  });
  log.info(`brick ${instanceId} bound to period ${config.period}`);
}

function applyPrefs(p: SilPrefs): void {
  setCredentials(p.email?.trim() ?? '', p.password ?? '');
  setPrices(pickPrices(p));
}

// ─── Module-load setup ──────────────────────────────────────────────────────
// Subscribe and register event handlers synchronously so we never miss an
// event the hub fires immediately after the plugin process starts.

useElectricityStore.subscribe(pushState);

onBrickConfigChange((instanceId, config) => bindInstance(instanceId, config));

onPreferencesChange<SilPrefs>(applyPrefs);

// ─── Plugin init (runs AFTER preferences are delivered) ────────────────────
// `getPreferences()` returns `{}` synchronously at module load — the real
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
  for (const release of baseReleases) release();
  for (const { release } of instanceReleases.values()) release();
  instanceReleases.clear();
  baseReleases.length = 0;
  stopAll();
  log.info('SIL electricity plugin stopping');
});

log.info('SIL electricity plugin loaded');
