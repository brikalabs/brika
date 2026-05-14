/**
 * Topological-sort services into dependency layers. Layer 0 is every
 * service with no deps; layer N is every service whose deps all sit
 * in layers 0..N-1. The TUI's dependency view uses this to render a
 * visual graph; the supervisor's scheduler doesn't need it (it just
 * watches per-service dep state).
 *
 * Caller must have already passed the config through `validateConfig`
 * so cycles are ruled out — this function assumes a DAG.
 */

import type { ServiceSpec } from './types';

export function topologicalLayers(
  services: readonly ServiceSpec[]
): ReadonlyArray<ReadonlyArray<ServiceSpec>> {
  const depthOf = new Map<string, number>();
  const byId = new Map<string, ServiceSpec>();
  for (const svc of services) {
    byId.set(svc.id, svc);
  }

  const compute = (id: string): number => {
    const cached = depthOf.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const svc = byId.get(id);
    if (!svc || svc.dependsOn.length === 0) {
      depthOf.set(id, 0);
      return 0;
    }
    let max = 0;
    for (const dep of svc.dependsOn) {
      const d = compute(dep) + 1;
      if (d > max) {
        max = d;
      }
    }
    depthOf.set(id, max);
    return max;
  };

  const layers: ServiceSpec[][] = [];
  for (const svc of services) {
    const depth = compute(svc.id);
    while (layers.length <= depth) {
      layers.push([]);
    }
    layers[depth]?.push(svc);
  }
  return layers;
}
