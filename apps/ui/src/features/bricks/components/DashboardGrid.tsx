import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from 'react-grid-layout/legacy';
import { ReactGridLayout } from 'react-grid-layout/legacy';
import type { Dashboard } from '../api';
import { useBrickTypes } from '../store';
import { DashboardBrick } from './DashboardBrick';

import 'react-grid-layout/css/styles.css';

const GAP = 12;

const BREAKPOINTS = { lg: 1200, md: 800, sm: 0 } as const;
const COL_MAP = { lg: 12, md: 8, sm: 4 } as const;

interface DashboardGridProps {
  dashboard: Dashboard;
  onSaveLayout: (
    layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>
  ) => void;
}

function layoutToPayload(currentLayout: Layout) {
  return currentLayout.map((l) => ({
    instanceId: l.i,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
  }));
}

export const DashboardGrid = memo(function DashboardGrid({
  dashboard,
  onSaveLayout,
}: DashboardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const brickTypes = useBrickTypes();

  // Measure container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Determine columns for current width
  const cols =
    width >= BREAKPOINTS.lg ? COL_MAP.lg : width >= BREAKPOINTS.md ? COL_MAP.md : COL_MAP.sm;

  // Square cells: rowHeight = colWidth
  const colWidth = width > 0 ? (width - GAP * (cols + 1)) / cols : 0;
  const rowHeight = Math.max(colWidth, 40);

  // Stable key — only changes when bricks are added/removed.
  const brickSetKey = useMemo(
    () => dashboard.bricks.map((c) => c.instanceId).join(','),
    [dashboard.bricks]
  );

  // Layout: computed from store positions. Recomputes on position/size/add/remove changes.
  // During drag/resize RGL manages positions internally — this only provides the "resting" state.
  const layout = useMemo(() => {
    return dashboard.bricks.map((brick) => {
      const ct = brickTypes.get(brick.brickTypeId);
      return {
        i: brick.instanceId,
        x: brick.position.x,
        y: brick.position.y,
        w: brick.size.w,
        h: brick.size.h,
        minW: ct?.minSize?.w ?? 1,
        minH: ct?.minSize?.h ?? 1,
        maxW: ct?.maxSize?.w ?? 12,
        maxH: ct?.maxSize?.h ?? 8,
      };
    });
  }, [dashboard.bricks, brickTypes]);

  // Children: only recreated on brick add/remove.
  const children = useMemo(
    () =>
      dashboard.bricks.map((brick) => (
        <div key={brick.instanceId}>
          <DashboardBrick instanceId={brick.instanceId} brickTypeId={brick.brickTypeId} />
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brickSetKey]
  );

  // Only save when drag/resize ends — NOT on every frame
  const handleDragStop = useCallback(
    (currentLayout: Layout) => {
      onSaveLayout(layoutToPayload(currentLayout));
    },
    [onSaveLayout]
  );
  const handleResizeStop = useCallback(
    (currentLayout: Layout) => {
      onSaveLayout(layoutToPayload(currentLayout));
    },
    [onSaveLayout]
  );

  // First render: just measure, don't render the grid yet
  if (width === 0) {
    return <div ref={containerRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div ref={containerRef} className="grid-placeholder">
      <ReactGridLayout
        width={width}
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        isDraggable
        isResizable
        draggableHandle=".drag-handle"
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        compactType="vertical"
        containerPadding={[0, 0]}
        margin={[GAP, GAP]}
      >
        {children}
      </ReactGridLayout>
    </div>
  );
});
