import { useBrickConfig } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Zap } from 'lucide-react';
import { useId, useMemo } from 'react';
import { ResponsiveContainer } from 'recharts';
import type { Granularity } from '../types';
import { buildRows, resolvePeriod, resolveStyle } from '../ui/chart-helpers';
import { AreaVariant, BarVariant, LineVariant, type RenderProps } from '../ui/chart-variants';
import { Loader, Message, PeriodPlaceholder, useSizeTier } from '../ui/states';
import { chartBrick } from './chart.brick';

export default function ConsumptionChart() {
  const state = chartBrick.data.use();
  const config = useBrickConfig(chartBrick.config);
  const { t, formatDate, formatTime } = useLocale();
  const gradId = useId();
  const tier = useSizeTier();

  const period = resolvePeriod(config);
  const periodState = state?.periods?.[period];

  const prices = state?.prices;
  const rows = useMemo(() => {
    if (!periodState?.data || !prices) {
      return [];
    }
    const fmt = { formatDate, formatTime };
    return buildRows(periodState.data.points, periodState.data.granularity, fmt, prices);
  }, [periodState?.data, formatDate, formatTime, prices]);

  if (!state) {
    return <Loader />;
  }
  if (!state.credentialsSet) {
    return <Message icon={Zap} text={t('ui.noCookie')} />;
  }
  if (rows.length === 0) {
    return <PeriodPlaceholder error={periodState?.error} />;
  }

  const granularity: Granularity = periodState?.data?.granularity ?? 'month';
  const style = resolveStyle(config);
  const hasInjection = rows.some((r) => r.injection > 0);
  const props: RenderProps = { rows, hasInjection, gradId };

  return (
    <div className="flex h-full flex-col">
      {tier !== 'compact' && (
        <div className="flex shrink-0 items-center justify-between px-1 pb-1">
          <span className="truncate font-semibold text-foreground/80 text-xs">
            {t(`ui.${granularity}Consumption`)}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">kWh</span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          {style === 'bar' && <BarVariant {...props} />}
          {style === 'area' && <AreaVariant {...props} />}
          {style === 'line' && <LineVariant {...props} />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
