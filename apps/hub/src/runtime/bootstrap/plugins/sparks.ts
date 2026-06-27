import { inject } from '@brika/di';
import { ConfigLoader } from '@/runtime/config';
import { EventSystem } from '@/runtime/events/event-system';
import { SparkStore } from '@/runtime/sparks/spark-store';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for spark event persistence.
 *
 * Initializes the SQLite-based spark store, starts its retention sweep, and
 * connects it to the event system.
 */
export function sparks(): BootstrapPlugin {
  const store = inject(SparkStore);
  const events = inject(EventSystem);
  const configLoader = inject(ConfigLoader);

  return {
    name: 'sparks',
    onInit() {
      store.init();
      const { retentionDays, pruneIntervalMs } = configLoader.get().hub.sparks;
      store.startRetention(retentionDays, pruneIntervalMs);
      events.setSparkStore(store);
    },
    onStop() {
      store.close();
    },
  };
}
