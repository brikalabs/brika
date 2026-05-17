import { useEffect, useState } from 'react';
import { fetchPluginMetrics, type PluginMetrics } from '../../../../shared/cli/api/plugins';

/**
 * Polls `/api/plugins/:uid/metrics` every 2 s while the plugin is
 * enabled; returns the latest snapshot. `null` while disabled or
 * before the first response arrives.
 */
export function useLiveMetrics(uid: string | null, enabled: boolean): PluginMetrics | null {
  const [metrics, setMetrics] = useState<PluginMetrics | null>(null);
  useEffect(() => {
    setMetrics(null);
    if (!uid || !enabled) {
      return;
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const m = await fetchPluginMetrics(uid);
        if (!cancelled) {
          setMetrics(m);
        }
      } catch {
        // Metrics endpoint is best-effort — ignore transient errors.
      }
    };
    void tick();
    const t = setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [uid, enabled]);
  return metrics;
}
