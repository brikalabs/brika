import { defineBrick, useAction, useBrickSize, useEffect, usePreference, useState } from '@brika/sdk/bricks/core';
import { Chart, Grid, Section, Stat, Status, Toggle } from '@brika/sdk/bricks/components';

const startedAt = Date.now();

// ─── Sub-components ──────────────────────────────────────────────────────────

function OverviewGrid({ uptime, monitoring, width }: { uptime: number; monitoring: boolean; width: number }) {
  return (
    <>
      <Grid columns={width >= 6 ? 3 : 2} gap="sm">
        <Stat label="Uptime" value={`${uptime}s`} icon="clock" trend="up" color="#22c55e" />
        <Stat label="Blocks" value={2} icon="box" />
        {width >= 6 && <Stat label="Sparks" value={4} icon="zap" color="#f59e0b" />}
      </Grid>
      <Status label="Timer Service" status={monitoring ? 'online' : 'offline'} icon="activity" />
    </>
  );
}

function BlocksGrid() {
  return (
    <Grid columns={2} gap="sm">
      <Stat label="Timer" value="one-shot" icon="timer" color="#22c55e" />
      <Stat label="Countdown" value="progress ticks" icon="clock" color="#3b82f6" />
    </Grid>
  );
}

// ─── Brick ───────────────────────────────────────────────────────────────────

export const timersDashboard = defineBrick(
  {
    id: 'timers-dashboard',
    name: 'Timers',
    description: 'Active timers & countdowns',
    icon: 'timer',
    color: '#22c55e',
    families: ['sm', 'md', 'lg'],
    category: 'monitoring',
    minSize: { w: 1, h: 1 },
    maxSize: { w: 12, h: 8 },
    config: [
      { type: 'number', name: 'refreshInterval', label: 'Refresh Interval (ms)', description: 'How often to update uptime', default: 5000, min: 1000, max: 30000, step: 1000 },
    ],
  },
  () => {
    const { width, height } = useBrickSize();
    const [refreshInterval] = usePreference<number>('refreshInterval', 5000);

    const [monitoring, setMonitoring] = useState(true);
    const [uptime, setUptime] = useState(0);
    const [history, setHistory] = useState<Array<{ ts: number; value: number }>>([]);

    useAction('toggle-monitoring', (payload?: Record<string, unknown>) => {
      setMonitoring((payload?.checked as boolean) ?? !monitoring);
    });

    useEffect(() => {
      const id = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        setUptime(secs);
        setHistory((prev: Array<{ ts: number; value: number }>) => [...prev.slice(-19), { ts: Date.now(), value: secs }]);
      }, refreshInterval);
      return () => clearInterval(id);
    }, []);

    // ── Narrow (1-2 cols): stacked column ────────────────────────────────
    if (width <= 2) {
      return (
        <>
          <Stat label="Uptime" value={`${uptime}s`} icon="clock" trend="up" color="#22c55e" />
          <Status label="Service" status={monitoring ? 'online' : 'offline'} icon="activity" />
          {height >= 3 && <Toggle label="Monitoring" checked={monitoring} onToggle="toggle-monitoring" icon="eye" />}
          {height >= 5 && history.length > 1 && (
            <Chart variant="area" data={history} color="#22c55e" label="Uptime (seconds)" />
          )}
        </>
      );
    }

    // ── Medium (3-4 cols): stats grid ────────────────────────────────────
    if (width <= 4) {
      return (
        <>
          <Grid columns={2} gap="sm">
            <Stat label="Uptime" value={`${uptime}s`} icon="clock" trend="up" color="#22c55e" />
            <Stat label="Blocks" value={2} icon="box" />
            {height >= 3 && <Stat label="Timer" value="one-shot" icon="timer" color="#22c55e" />}
            {height >= 3 && <Stat label="Countdown" value="ticks" icon="clock" color="#3b82f6" />}
          </Grid>
          <Status label="Timer Service" status={monitoring ? 'online' : 'offline'} icon="activity" />
          {height >= 4 && <Toggle label="Monitoring" checked={monitoring} onToggle="toggle-monitoring" icon="eye" />}
          {height >= 5 && history.length > 1 && (
            <Chart variant="area" data={history} color="#22c55e" label="Uptime (seconds)" />
          )}
        </>
      );
    }

    // ── Wide (5+ cols): full sections ────────────────────────────────────
    return (
      <>
        <Section title="Overview">
          <OverviewGrid uptime={uptime} monitoring={monitoring} width={width} />
        </Section>

        {height >= 3 && (
          <Section title="Blocks">
            <BlocksGrid />
          </Section>
        )}

        {height >= 4 && history.length > 1 && (
          <Section title="Uptime History">
            <Chart variant="area" data={history} color="#22c55e" label="Uptime (seconds)" />
          </Section>
        )}

        <Toggle label="Monitoring" checked={monitoring} onToggle="toggle-monitoring" icon="eye" />
      </>
    );
  },
);
