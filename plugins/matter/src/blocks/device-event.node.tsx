/**
 * "When Device Changes" node-body view.
 *
 * Shows which device is watched and the attributes being observed (each maps to
 * a dynamic output handle below the node).
 */

import { useBlockConfig } from '@brika/sdk/block-views';
import { Radio } from 'lucide-react';

interface WatchedAttribute {
  name: string;
}

interface DeviceEventConfig {
  nodeId?: string;
  attributes?: WatchedAttribute[];
}

export default function DeviceEventNode() {
  const config = useBlockConfig<DeviceEventConfig>();
  const attributes = config.attributes ?? [];

  if (!config.nodeId) {
    return (
      <p className="text-muted-foreground text-xs italic">Pick a device to watch in the config.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-indigo-500">
        <Radio className="size-3.5" />
        <span className="font-medium text-foreground text-xs">Watching</span>
      </div>
      {attributes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Any change</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {attributes.map((attr) => (
            <span
              key={attr.name}
              className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-600 dark:text-indigo-300"
            >
              {attr.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
