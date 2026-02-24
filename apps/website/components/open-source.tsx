import { Heart } from 'lucide-react';
import { github } from '@/lib/config';
import { AnimatedSection } from './ui/animated-section';
import { GithubIcon } from './ui/github-icon';

export function OpenSource() {
  return (
    <AnimatedSection className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-3xl corner-squircle border border-border bg-surface px-6 py-16 text-center md:px-16">
          {/* Subtle radial glow */}
          <div
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 size-100 rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--glow) 0%, transparent 70%)' }}
          />

          <div className="relative">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Heart className="size-3.5" />
              Open Source
            </div>

            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Built in the open
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
              Brika is MIT-licensed and open source. Read the code, fork it, contribute — it&apos;s
              yours.
            </p>

            <a
              href={github.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition-all hover:bg-muted hover:shadow-lg hover:shadow-primary/5"
            >
              <GithubIcon className="size-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
