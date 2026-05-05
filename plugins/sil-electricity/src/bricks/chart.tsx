import { useBrickConfig, useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { useId, useMemo } from 'react';
import { ResponsiveContainer } from 'recharts';
import type { ElectricityState, Granularity } from '../types';
import { buildRows, resolvePeriod, resolveStyle } from '../ui/chart-helpers';
import { AreaVariant, BarVariant, LineVariant, type RenderProps } from '../ui/chart-variants';
import { Loader, Message } from '../ui/states';

export default function ConsumptionChart() {
  const state = useBrickData<ElectricityState>();
  const config = useBrickConfig();
  const { t, locale } = useLocale();
  const gradId = useId();

  const period = resolvePeriod(config);
  const periodState = state?.periods?.[period];

  const prices = state?.prices;
  const rows = useMemo(() => {
    if (!periodState?.data || !prices) return [];
    return buildRows(periodState.data.points, periodState.data.granularity, locale, prices);
  }, [periodState?.data, locale, prices]);

  if (!state) return <Loader />;
  if (!state.credentialsSet) return <Message icon="⚡" text={t('ui.noCookie')} />;
  if (periodState?.error === 'auth' && !periodState.data) {
    return <Message icon="🔒" text={t('ui.authError')} />;
  }
  if (periodState?.error === 'network' && !periodState.data) {
    return <Message icon="📡" text={t('ui.networkError')} />;
  }
  if (rows.length === 0) return <Loader />;

  const granularity: Granularity = periodState?.data?.granularity ?? 'month';
  const style = resolveStyle(config);
  const hasInjection = rows.some((r) => r.injection > 0);
  const props: RenderProps = { rows, hasInjection, gradId };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between px-1 pb-1">
        <span className="text-xs font-semibold text-foreground/80">
          {t(`ui.${granularity}Consumption`)}
        </span>
        <span className="text-[10px] text-muted-foreground">kWh</span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 1, height: 1 }}
        >
          {style === 'bar' && <BarVariant {...props} />}
          {style === 'area' && <AreaVariant {...props} />}
          {style === 'line' && <LineVariant {...props} />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
