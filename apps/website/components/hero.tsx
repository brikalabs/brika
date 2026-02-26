import { ArrowDown, Sparkles, Tag } from 'lucide-react';
import { github } from '@/lib/config';
import { SiGithub } from 'react-icons/si';
import { Button } from './ui/button';

interface HeroProps {
  release?: { version: string; url: string } | null;
}

export function Hero({ release }: Readonly<HeroProps>) {
  return (
    <section className="hero-parallax relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6">
      {/* Aurora blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="aurora-blob absolute top-[15%] left-[20%] size-[500px] bg-primary md:size-[700px]"
          style={{ animation: 'aurora-drift-1 20s ease-in-out infinite' }}
        />
        <div
          className="aurora-blob absolute top-[40%] right-[15%] size-[400px] bg-accent md:size-[600px]"
          style={{ animation: 'aurora-drift-2 25s ease-in-out infinite' }}
        />
        <div
          className="aurora-blob absolute bottom-[10%] left-[40%] size-[450px] bg-primary md:size-[650px]"
          style={{ animation: 'aurora-drift-3 18s ease-in-out infinite' }}
        />
      </div>

      {/* Dot grid */}
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.04]" />

      <div className="max-w-4xl text-center">
        {/* Badges */}
        <div
          className="reveal-up mb-8 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: '200ms' }}
        >
          <div className="badge-glow inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="size-3.5 shrink-0" />
            <span>Open source &middot; Self-hosted &middot; Local-first</span>
          </div>
          {release && (
            <a
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/50 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground hover:bg-surface"
            >
              <Tag className="size-3 shrink-0" />
              {release.version}
            </a>
          )}
        </div>

        <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl md:text-7xl">
          <span className="block overflow-hidden pb-1">
            <span className="text-reveal-word" style={{ animationDelay: '350ms' }}>
              Build.
            </span>{' '}
            <span className="text-reveal-word" style={{ animationDelay: '470ms' }}>
              Run.
            </span>{' '}
            <span className="text-reveal-word" style={{ animationDelay: '590ms' }}>
              Integrate.
            </span>
          </span>
          <span className="block overflow-hidden pb-1">
            <span className="hero-gradient text-reveal-word" style={{ animationDelay: '770ms' }}>
              Keep Automating.
            </span>
          </span>
        </h1>

        <p
          className="reveal-up mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
          style={{ animationDelay: '950ms' }}
        >
          A self-hosted automation hub that runs on your machine. One binary, no cloud, full
          control.
        </p>

        {/* CTAs */}
        <div
          className="reveal-up mt-10 flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: '1100ms' }}
        >
          <Button href="#install" variant="filled" size="lg" className="group">
            Get started
            <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
          </Button>
          <Button href={github.url} target="_blank" rel="noopener noreferrer" variant="outline" size="lg">
            <SiGithub className="size-4" />
            GitHub
          </Button>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <ArrowDown className="scroll-hint size-5 text-muted-foreground" />
      </div>
    </section>
  );
}
