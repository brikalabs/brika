'use client';

import type { LucideIcon } from 'lucide-react';
import { Gauge, GripVertical, LayoutGrid, Lightbulb, Music, Sun, Timer, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { Layout, LayoutItem } from 'react-grid-layout';
import { ReactGridLayout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import { AnimatedSection } from './ui/animated-section';

const GAP = 8;
const COLS = 3;
const GRID_SIZE = 360;

interface Brick {
  id: string;
  title: string;
  icon: LucideIcon;
  value: string;
  label: string;
  color: string;
}

const bricks: Brick[] = [
  {
    id: 'weather',
    title: 'Weather',
    icon: Sun,
    value: '22\u00b0C',
    label: 'Sunny',
    color: 'oklch(0.72 0.18 45)',
  },
  {
    id: 'energy',
    title: 'Energy',
    icon: Zap,
    value: '3.2 kWh',
    label: "Today's usage",
    color: 'oklch(0.72 0.15 145)',
  },
  {
    id: 'timer',
    title: 'Timer',
    icon: Timer,
    value: '04:32',
    label: 'Remaining',
    color: 'oklch(0.7 0.16 265)',
  },
  {
    id: 'cpu',
    title: 'CPU',
    icon: Gauge,
    value: '47%',
    label: 'Load average',
    color: 'oklch(0.7 0.16 300)',
  },
  {
    id: 'spotify',
    title: 'Spotify',
    icon: Music,
    value: 'Playing',
    label: 'Lo-fi Beats',
    color: 'oklch(0.72 0.15 145)',
  },
  {
    id: 'lights',
    title: 'Lights',
    icon: Lightbulb,
    value: 'On',
    label: 'Living room',
    color: 'oklch(0.8 0.16 90)',
  },
];

// 3×3 grid: fills nicely, some bricks span 2 cols
const initialLayout: LayoutItem[] = [
  { i: 'weather', x: 0, y: 0, w: 1, h: 1 },
  { i: 'energy', x: 1, y: 0, w: 1, h: 1 },
  { i: 'timer', x: 2, y: 0, w: 1, h: 1 },
  { i: 'cpu', x: 0, y: 1, w: 1, h: 1 },
  { i: 'spotify', x: 1, y: 1, w: 2, h: 1 },
  { i: 'lights', x: 0, y: 2, w: 2, h: 1 },
];

function BrickCard({ brick }: Readonly<{ brick: Brick }>) {
  return (
    <div className="group flex h-full flex-col rounded-xl corner-squircle border border-border bg-surface p-3 transition-shadow hover:shadow-md">
      <div className="drag-handle flex cursor-grab items-center gap-1.5 active:cursor-grabbing">
        <brick.icon className="size-3.5 shrink-0" style={{ color: brick.color }} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
          {brick.title}
        </span>
        <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="no-drag mt-auto pt-1.5">
        <div className="text-lg font-bold leading-tight tracking-tight">{brick.value}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{brick.label}</div>
      </div>
    </div>
  );
}

function DraggableGrid() {
  const [layout, setLayout] = useState(initialLayout);

  const colWidth = (GRID_SIZE - GAP * (COLS + 1)) / COLS;
  const rowHeight = colWidth;

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout]);
  }, []);

  return (
    <div className="brick-grid mx-auto" style={{ width: GRID_SIZE }}>
      <ReactGridLayout
        width={GRID_SIZE}
        layout={layout}
        cols={COLS}
        rowHeight={rowHeight}
        isDraggable
        isResizable={false}
        draggableHandle=".drag-handle"
        draggableCancel=".no-drag"
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        containerPadding={[0, 0]}
        margin={[GAP, GAP]}
      >
        {bricks.map((brick) => (
          <div key={brick.id}>
            <BrickCard brick={brick} />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}

export function Bricks() {
  return (
    <AnimatedSection id="bricks" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Text */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <LayoutGrid className="size-5 text-primary" />
              <span className="text-sm font-semibold text-primary">Bricks</span>
            </div>
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Your dashboard, your data
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              Bricks are live dashboard cards that plugins provide. Weather, timers, device
              controls, music — each brick displays real-time data and actions on a customizable
              grid.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" />{' '}
                Drag-and-drop grid layout
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" />{' '}
                Real-time data from plugins
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" />{' '}
                Interactive actions and controls
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground italic">
              Try dragging the cards to rearrange them.
            </p>
          </div>

          {/* Interactive mock dashboard */}
          <DraggableGrid />
        </div>
      </div>
    </AnimatedSection>
  );
}
