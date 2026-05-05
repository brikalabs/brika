/**
 * Plugin-shared state and the `patchPeriod` helper. State is per-period so
 * each brick can independently subscribe to whichever window it wants.
 */

import { defineSharedStore } from '@brika/sdk';
import type { ElectricityState, Period, PeriodState, Prices } from '../types';

const DEFAULT_PRICES: Prices = { perKwh: 0.3, perInjection: 0.1 };

export const useElectricityStore = defineSharedStore<ElectricityState>({
  credentialsSet: false,
  authed: false,
  periods: {},
  prices: DEFAULT_PRICES,
});

const EMPTY_PERIOD: PeriodState = { data: null, loading: false, error: null };

export function patchPeriod(period: Period, patch: Partial<PeriodState>): void {
  useElectricityStore.set((prev) => ({
    ...prev,
    periods: {
      ...prev.periods,
      [period]: { ...EMPTY_PERIOD, ...prev.periods[period], ...patch },
    },
  }));
}

export function setAuthed(authed: boolean): void {
  useElectricityStore.set((prev) => ({ ...prev, authed }));
}

export function setCredentialsKnown(credentialsSet: boolean): void {
  useElectricityStore.set((prev) => ({ ...prev, credentialsSet }));
}

export function setPrices(prices: Prices): void {
  useElectricityStore.set((prev) => ({ ...prev, prices }));
}

export function resetState(): void {
  useElectricityStore.set({
    credentialsSet: false,
    authed: false,
    periods: {},
    prices: DEFAULT_PRICES,
  });
}
