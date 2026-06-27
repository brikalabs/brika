import { inject } from '@brika/di';
import { ConfigLoader } from '@/runtime/config';
import { WorkflowEngine } from '@/runtime/workflows';
import { RunStore } from '@/runtime/workflows/runs/run-store';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for workflow run persistence.
 *
 * Initializes the SQLite-based run store, starts its retention sweep, and
 * subscribes it to the global execution-event stream so every run is recorded to
 * `workflows.db`. Registered before the workflows loader so workflows that
 * auto-start on boot are captured.
 */
export function workflowRuns(): BootstrapPlugin {
  const store = inject(RunStore);
  const engine = inject(WorkflowEngine);
  const configLoader = inject(ConfigLoader);
  let unsubscribe: (() => void) | null = null;

  return {
    name: 'workflow-runs',
    onInit() {
      store.init();
      const { retentionDays, pruneIntervalMs } = configLoader.get().hub.workflows;
      store.startRetention(retentionDays, pruneIntervalMs);
      unsubscribe = engine.addGlobalListener((event) => store.record(event));
    },
    onStop() {
      unsubscribe?.();
      store.close();
    },
  };
}
