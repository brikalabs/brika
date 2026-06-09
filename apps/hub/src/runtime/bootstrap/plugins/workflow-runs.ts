import { inject } from '@brika/di';
import { WorkflowEngine } from '@/runtime/workflows';
import { RunStore } from '@/runtime/workflows/runs/run-store';
import type { BootstrapPlugin } from '../plugin';

/**
 * Bootstrap plugin for workflow run persistence.
 *
 * Initializes the SQLite-based run store and subscribes it to the global
 * execution-event stream so every run is recorded to `workflows.db`. Registered
 * before the workflows loader so workflows that auto-start on boot are captured.
 */
export function workflowRuns(): BootstrapPlugin {
  const store = inject(RunStore);
  const engine = inject(WorkflowEngine);
  let unsubscribe: (() => void) | null = null;

  return {
    name: 'workflow-runs',
    onInit() {
      store.init();
      unsubscribe = engine.addGlobalListener((event) => store.record(event));
    },
    onStop() {
      unsubscribe?.();
      store.close();
    },
  };
}
