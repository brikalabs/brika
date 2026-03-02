/**
 * Timers Dashboard brick — client-side rendered.
 *
 * Displays plugin uptime, block/spark counts, and a simple activity chart.
 * Block and spark counts are pushed from the plugin process via setBrickData().
 * The uptime counter and chart history are maintained as local client state.
 */

import { useBrickConfig, useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import clsx from 'clsx';
import { Activity, Box, Clock, Eye, EyeOff, Loader2, Timer, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  blockCount: number;
  sparkCount: number;
  startedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: Readonly<{
  label: string;
  value: string | number;
  icon: typeof Clock;
  color?: string;
}>) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3" style={color ? { color } : undefined} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function StatusIndicator({ label, online, icon: Icon }: Readonly<{
  label: string;
  online: boolean;
  icon: typeof Activity;
}>) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-xs text-foreground">{label}</span>
      <span
        className={clsx('ml-auto size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-zinc-400')}
      />
      <span className="text-[10px] text-muted-foreground">{online ? 'Online' : 'Offline'}</span>
    </div>
  );
}

function MiniChart({ history, color }: Readonly<{ history: number[]; color: string }>) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  const barCount = history.length;

  return (
    <div className="flex h-16 items-end gap-px rounded-md bg-muted/30 p-2">
      {history.map((value, i) => (
        <div
          key={`${i}-${value}`}
          className="flex-1 rounded-t-sm transition-all duration-300"
          style={{
            height: `${Math.max(4, (value / max) * 100)}%`,
            backgroundColor: color,
            opacity: 0.3 + (i / barCount) * 0.7,
          }}
        />
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimersDashboard() {
  const { width, height } = useBrickSize();
  const config = useBrickConfig();
  const data = useBrickData<DashboardData>();

  const refreshInterval = typeof config.refreshInterval === 'number' ? config.refreshInterval : 5000;

  const [monitoring, setMonitoring] = useState(true);
  const [uptime, setUptime] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  const blockCount = data?.blockCount ?? 0;
  const sparkCount = data?.sparkCount ?? 0;
  const startedAt = data?.startedAt ?? Date.now();

  const handleToggleMonitoring = useCallback(() => {
    setMonitoring((m) => !m);
  }, []);

  // Update uptime counter
  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setUptime(secs);
      setHistory((prev) => [...prev.slice(-19), secs]);
    };
    tick();
    const id = setInterval(tick, refreshInterval);
    return () => clearInterval(id);
  }, [startedAt, refreshInterval]);

  // ── Loading ─────────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Narrow (1-2 cols) ───────────────────────────────────────────────

  if (width <= 2) {
    return (
      <div className="flex h-full flex-col gap-2 p-2">
        <StatCard label="Uptime" value={formatUptime(uptime)} icon={Clock} color="#22c55e" />
        <StatusIndicator label="Service" online={monitoring} icon={Activity} />
        {height >= 3 && (
          <button
            type="button"
            onClick={handleToggleMonitoring}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {monitoring ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            Monitoring
          </button>
        )}
        {height >= 5 && <MiniChart history={history} color="#22c55e" />}
      </div>
    );
  }

  // ── Medium (3-4 cols) ───────────────────────────────────────────────

  if (width <= 4) {
    return (
      <div className="flex h-full flex-col gap-2 p-2">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Uptime" value={formatUptime(uptime)} icon={Clock} color="#22c55e" />
          <StatCard label="Blocks" value={blockCount} icon={Box} />
          {height >= 3 && (
            <>
              <StatCard label="Timer" value="one-shot" icon={Timer} color="#22c55e" />
              <StatCard label="Countdown" value="ticks" icon={Clock} color="#3b82f6" />
            </>
          )}
        </div>
        <StatusIndicator label="Timer Service" online={monitoring} icon={Activity} />
        {height >= 4 && (
          <button
            type="button"
            onClick={handleToggleMonitoring}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {monitoring ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            Monitoring
          </button>
        )}
        {height >= 5 && <MiniChart history={history} color="#22c55e" />}
      </div>
    );
  }

  // ── Wide (5+ cols) ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Overview section */}
      <div>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Overview
        </h3>
        <div className={`grid gap-2 ${width >= 6 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <StatCard label="Uptime" value={formatUptime(uptime)} icon={Clock} color="#22c55e" />
          <StatCard label="Blocks" value={blockCount} icon={Box} />
          {width >= 6 && <StatCard label="Sparks" value={sparkCount} icon={Zap} color="#f59e0b" />}
        </div>
        <div className="mt-2">
          <StatusIndicator label="Timer Service" online={monitoring} icon={Activity} />
        </div>
      </div>

      {/* Blocks section */}
      {height >= 3 && (
        <div>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Blocks
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Timer" value="one-shot" icon={Timer} color="#22c55e" />
            <StatCard label="Countdown" value="progress ticks" icon={Clock} color="#3b82f6" />
          </div>
        </div>
      )}

      {/* Uptime chart */}
      {height >= 4 && (
        <div>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Uptime History
          </h3>
          <MiniChart history={history} color="#22c55e" />
        </div>
      )}

      {/* Monitoring toggle */}
      <button
        type="button"
        onClick={handleToggleMonitoring}
        className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
      >
        {monitoring ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        Monitoring
      </button>
    </div>
  );
}
