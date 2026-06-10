/**
 * SIL Electricity Plugin Tools
 *
 * Hub-wide, AI-discoverable capability: `get-consumption` returns the
 * household's electricity consumption for a period plus the cost estimate at
 * the configured tariff, so an agent can answer "how much electricity did we
 * use this week?" or drive a daily cost-report workflow.
 *
 * It reads the same shared store the bricks render from, refreshing the
 * period on demand through the existing polling path (one code path, one
 * auth/cooldown policy).
 */

import { defineTool, z } from '@brika/sdk';
import { useElectricityStore } from './store';
import { pollPeriod } from './store/polling';
import type { Period } from './types';

const periodSchema = z.enum(['24h', '7d', '30d', '12m', '24m']);

function totals(period: Period): { consumedKwh: number; injectedKwh: number } | null {
  const state = useElectricityStore.get().periods[period];
  const points = state?.data?.points;
  if (!points || points.length === 0) {
    return null;
  }
  let consumedKwh = 0;
  let injectedKwh = 0;
  for (const point of points) {
    consumedKwh += point.total;
    injectedKwh += point.injection;
  }
  return { consumedKwh, injectedKwh };
}

defineTool(
  {
    id: 'get-consumption',
    description:
      'Household electricity consumption for a period (24h, 7d, 30d, 12m, 24m): total kWh consumed, kWh injected back to the grid (solar), and the net cost estimate in CHF at the configured tariff.',
    icon: 'zap',
    color: '#eab308',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: [...periodSchema.options],
          description: 'Aggregation period (default 24h)',
        },
      },
    },
  },
  async (args) => {
    const parsed = z.object({ period: periodSchema.default('24h') }).parse(args);

    // Refresh on demand so the answer is current even when no brick is
    // polling this period; auth/cooldown failures land in the period state.
    await pollPeriod(parsed.period);

    const state = useElectricityStore.get();
    const periodState = state.periods[parsed.period];
    if (periodState?.error) {
      return { ok: false, error: `SIL data unavailable: ${periodState.error}` };
    }
    const sums = totals(parsed.period);
    if (!sums) {
      return { ok: false, error: 'No consumption data for this period yet' };
    }

    const { prices } = state;
    const costChf = sums.consumedKwh * prices.perKwh - sums.injectedKwh * prices.perInjection;
    return {
      ok: true,
      period: parsed.period,
      consumedKwh: Number(sums.consumedKwh.toFixed(2)),
      injectedKwh: Number(sums.injectedKwh.toFixed(2)),
      estimatedCostChf: Number(costChf.toFixed(2)),
      tariffChfPerKwh: prices.perKwh,
    };
  }
);
