/**
 * {{pascal}} Brick — client-rendered dashboard component.
 *
 * This runs in the browser as a real React component.
 * Data is pushed from the plugin process via setBrickData().
 */

import { useBrickData, useBrickSize } from '@brika/sdk/brick-views';

interface {{pascal}}Data {
  count: number;
  active: boolean;
}

export default function {{pascal}}() {
  const data = useBrickData<{{pascal}}Data>();
  const { width } = useBrickSize();

  if (!data) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>;
  }

  // Small (1-2 cols) — compact view
  if (width <= 2) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <span className="text-2xl font-bold">{data.count}</span>
      </div>
    );
  }

  // Medium+ — full view
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Count</span>
        <span className={`text-xs ${data.active ? 'text-green-500' : 'text-muted-foreground'}`}>
          {data.active ? 'Running' : 'Paused'}
        </span>
      </div>
      <span className="text-3xl font-bold">{data.count}</span>
    </div>
  );
}
