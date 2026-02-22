import { Blocks, Cable, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { AnimatedSection } from './ui/animated-section';

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

export function Features() {
  return (
    <AnimatedSection id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">
          Why Brika
        </h2>
        <p className="mb-12 text-center text-muted-foreground">
          Everything runs locally. You own the data, the plugins, the infra.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl corner-squircle border border-border bg-surface p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Subtle gradient accent on hover */}
              <div
                className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10"
                style={{ background: f.color }}
              />
              <div
                className="mb-4 inline-flex size-10 items-center justify-center rounded-xl corner-squircle"
                style={{ backgroundColor: `color-mix(in oklch, ${f.color}, transparent 88%)` }}
              >
                <f.icon className="size-5" style={{ color: f.color }} />
              </div>
              <h3 className="mb-1.5 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {f.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}
