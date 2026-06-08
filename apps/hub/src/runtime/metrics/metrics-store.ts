import { singleton } from '@brika/di';
import { z } from 'zod';

export interface MetricsSample {
  ts: number;
  cpu: number;
  memory: number;
}

/** Validates a persisted metrics snapshot read back from disk at boot. */
export const MetricsSnapshotSchema = z.record(
  z.string(),
  z.array(z.object({ ts: z.number(), cpu: z.number(), memory: z.number() }))
);

interface PluginMetricsData {
  samples: MetricsSample[];
}

/**
 * In-memory ring buffer store for plugin process metrics.
 * Stores the last N samples per plugin for time-series display.
 */
@singleton()
export class MetricsStore {
  readonly #data = new Map<string, PluginMetricsData>();
  readonly #maxSamples = 60; // 5 minutes at 5s intervals

  record(pluginName: string, sample: MetricsSample): void {
    let data = this.#data.get(pluginName);
    if (!data) {
      data = {
        samples: [],
      };
      this.#data.set(pluginName, data);
    }

    data.samples.push(sample);

    // Ring buffer: remove oldest if over limit
    while (data.samples.length > this.#maxSamples) {
      data.samples.shift();
    }
  }

  get(pluginName: string): MetricsSample[] {
    return this.#data.get(pluginName)?.samples ?? [];
  }

  /**
   * Plain snapshot of all retained samples, for persistence across restarts.
   * The store itself does no IO — bootstrap writes this to disk on shutdown
   * and feeds it back through {@link restore} on boot, so the CPU/memory
   * charts survive a hub restart instead of resetting to empty.
   */
  snapshot(): Record<string, MetricsSample[]> {
    const out: Record<string, MetricsSample[]> = {};
    for (const [name, data] of this.#data) {
      out[name] = data.samples;
    }
    return out;
  }

  /** Seed the ring buffers from a persisted snapshot (once, at boot). */
  restore(data: Record<string, MetricsSample[]>): void {
    for (const [name, samples] of Object.entries(data)) {
      this.#data.set(name, { samples: samples.slice(-this.#maxSamples) });
    }
  }

  clear(pluginName: string): void {
    this.#data.delete(pluginName);
  }

  clearAll(): void {
    this.#data.clear();
  }
}
