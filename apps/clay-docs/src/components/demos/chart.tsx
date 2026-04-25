import { MetricsChart } from '@brika/clay/components/chart';

const now = Date.now();
const data = Array.from({ length: 24 }, (_, index) => ({
  ts: now - (23 - index) * 60_000 * 60,
  value: 30 + Math.sin(index / 3) * 18 + index * 1.5,
}));

export function ChartDefaultDemo() {
  return (
    <div style={{ height: 176, width: 360 }}>
      <MetricsChart data={data} />
    </div>
  );
}
