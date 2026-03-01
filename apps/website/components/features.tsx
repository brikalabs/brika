'use client';

import { Blocks, Cable, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { useTilt3D } from '@/lib/use-tilt-3d';
import { cn } from '@/lib/utils';
import { useOnceVisible } from './ui/animated-section';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  tags: string[];
}

const features: Feature[] = [
  {
    icon: Blocks,
    title: 'Reactive blocks',
    description:
      'Type-safe workflow blocks powered by Zod and reactive streams. Full inference, zero boilerplate.',
    color: 'oklch(0.72 0.15 145)',
    tags: ['Zod', 'Type-safe', 'Reactive'],
  },
  {
    icon: Cable,
    title: 'Isolated plugins',
    description:
      'Every plugin runs in its own process. Crash isolation, binary IPC, hot-reload out of the box.',
    color: 'oklch(0.7 0.16 265)',
    tags: ['Process isolation', 'IPC', 'Hot-reload'],
  },
  {
    icon: LayoutDashboard,
    title: 'Visual editor',
    description:
      'Drag-and-drop automation builder in your browser. Connect blocks, configure flows, see results live.',
    color: 'oklch(0.72 0.18 45)',
    tags: ['Drag & drop', 'Real-time', 'Browser'],
  },
];

function FeatureCard({
  feature,
  visible,
  index,
}: Readonly<{
  feature: Feature;
  visible: boolean;
  index: number;
}>) {
  const { ref, onMouseMove, onMouseLeave } = useTilt3D(8);

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        'tilt-card feature-card group relative overflow-hidden rounded-2xl corner-squircle border border-border bg-surface p-6 will-change-transform',
        visible ? 'animate-[card-enter_0.5s_ease-out_backwards]' : 'opacity-0'
      )}
      style={
        visible
          ? ({
              animationDelay: `${250 + index * 120}ms`,
              '--card-color': feature.color,
            } as React.CSSProperties)
          : undefined
      }
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Cursor-following glow */}
      <div
        className="tilt-card-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={
          {
            '--card-accent': `color-mix(in oklch, ${feature.color} 15%, transparent)`,
          } as React.CSSProperties
        }
      />

      {/* Shine sweep */}
      <div className="tilt-card-shine pointer-events-none absolute inset-0 overflow-hidden" />

      {/* Subtle gradient accent blob on hover */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10"
        style={{
          background: feature.color,
        }}
      />

      <div
        className="relative mb-4 inline-flex size-12 items-center justify-center rounded-xl corner-squircle"
        style={{
          backgroundColor: `color-mix(in oklch, ${feature.color}, transparent 88%)`,
        }}
      >
        <feature.icon
          className="size-6"
          style={{
            color: feature.color,
          }}
        />
      </div>
      <h3 className="relative mb-1.5 text-lg font-semibold">{feature.title}</h3>
      <p className="relative text-sm leading-relaxed text-muted-foreground">
        {feature.description}
      </p>
      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {feature.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Features() {
  const { ref, visible } = useOnceVisible();

  return (
    <section ref={ref} id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2
          className={cn(
            'mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl',
            'transition-[opacity,transform] duration-700 ease-out',
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}
        >
          Why Brika
        </h2>
        <p
          className={cn(
            'mb-12 text-center text-muted-foreground',
            'transition-[opacity,transform] duration-700 ease-out',
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}
          style={{
            transitionDelay: visible ? '100ms' : '0ms',
          }}
        >
          Everything runs locally. You own the data, the plugins, the infra.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <FeatureCard key={f.title} feature={f} visible={visible} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
