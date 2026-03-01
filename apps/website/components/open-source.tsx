import { Heart } from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import { github } from '@/lib/config';
import { AnimatedSection } from './ui/animated-section';
import { Button } from './ui/button';

export function OpenSource() {
  return (
    <AnimatedSection className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-3xl corner-squircle border border-border bg-surface px-6 py-16 text-center md:px-16">
          {/* Aurora glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <div
              className="aurora-blob absolute -top-20 left-1/3 size-80"
              style={{
                background: 'var(--primary)',
                animation: 'aurora-drift-1 15s ease-in-out infinite',
              }}
            />
            <div
              className="aurora-blob absolute -bottom-20 right-1/3 size-60"
              style={{
                background: 'var(--accent)',
                animation: 'aurora-drift-2 20s ease-in-out infinite',
              }}
            />
          </div>

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

            <Button
              href={github.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="lg"
            >
              <SiGithub className="size-4" />
              View on GitHub
            </Button>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
