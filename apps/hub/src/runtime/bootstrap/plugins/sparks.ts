import { inject } from '@brika/di';
import { EventSystem } from '@/runtime/events/event-system';
import { SparkStore } from '@/runtime/sparks/spark-store';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for spark event persistence.
 *
 * Initializes the SQLite-based spark store and connects it to the event system.
 */
export function sparks(): BootstrapPlugin {
  const store = inject(SparkStore);
  const events = inject(EventSystem);

  return {
    name: 'sparks',
    async onInit() {
      await store.init();
      events.setSparkStore(store);
    },
    onStop() {
      store.close();
    },
  };
}
