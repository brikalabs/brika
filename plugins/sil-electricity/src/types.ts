export type Granularity = 'minute' | 'hour' | 'day' | 'month';

export type Period = '24h' | '7d' | '30d' | '12m' | '24m';

export interface ConsumptionPoint {
  timestamp: string;
  /** Total kWh consumed */
  total: number;
  /** kWh injected (production / solar) */
  injection: number;
}

export interface ConsumptionData {
  points: ConsumptionPoint[];
  granularity: Granularity;
  period: Period;
  lastUpdated: number;
}

export interface PeriodState {
  data: ConsumptionData | null;
  loading: boolean;
  error: string | null;
}

export interface Prices {
  /** Cost per kWh consumed (CHF) */
  perKwh: number;
  /** Credit per kWh injected back to the grid (CHF) */
  perInjection: number;
}

export interface ElectricityState {
  /** True once email + password are configured in plugin prefs */
  credentialsSet: boolean;
  /** True once we have valid SIL session cookies (transient — cleared on auth failure) */
  authed: boolean;
  /** Per-period data, error, and loading state */
  periods: Partial<Record<Period, PeriodState>>;
  /** Tariff configured in plugin preferences */
  prices: Prices;
}
