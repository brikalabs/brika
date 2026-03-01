import { singleton } from '@brika/di';

export interface MetricsSample {
  ts: number;
  cpu: number;
  memory: number;
}

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

  clear(pluginName: string): void {
    this.#data.delete(pluginName);
  }

  clearAll(): void {
    this.#data.clear();
  }
}
