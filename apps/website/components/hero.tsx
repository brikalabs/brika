import { ArrowDown, Sparkles } from 'lucide-react';
import { GithubIcon } from './ui/github-icon';
import { github } from '@/lib/config';

export function Hero() {
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6">
      {/* Glow */}
      <div
        className="hero-glow pointer-events-none absolute top-1/2 left-1/2 -z-10 size-150 rounded-full md:size-200"
        style={{
          background: 'radial-gradient(circle, var(--glow) 0%, transparent 70%)',
        }}
      />
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.04]" />

      <div className="max-w-4xl text-center">
        {/* Badge */}
        <div className="badge-glow mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="size-3.5" />
          Open source &middot; Self-hosted &middot; Local-first
        </div>

        <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl md:text-7xl">
          Build. Run. Integrate. <br className="hidden sm:block" />
          <span className="hero-gradient">Keep Automating.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          A self-hosted automation hub that runs on your machine. One binary, no cloud, full
          control.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#install"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110"
          >
            Get started
            <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
          </a>
          <a
            href={github.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-muted-foreground/40">
        <ArrowDown className="size-5" />
      </div>
    </section>
  );
}
