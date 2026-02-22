import { Suspense } from 'react';
import { Bricks } from '@/components/bricks';
import { Features } from '@/components/features';
import { Footer } from '@/components/footer';
import { Hero } from '@/components/hero';
import { Nav } from '@/components/nav';
import { OpenSource } from '@/components/open-source';
import { Plugins } from '@/components/plugins';
import { QuickStart } from '@/components/quick-start';

function PluginsSkeleton() {
  return (
    <section id="plugins" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">Plugins</h2>
        <p className="mb-12 text-center text-muted-foreground">
          Extend Brika with community and official plugins from npm.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl corner-squircle border border-border bg-surface"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <QuickStart />
        <Features />
        <Bricks />
        <Suspense fallback={<PluginsSkeleton />}>
          <Plugins />
        </Suspense>
        <OpenSource />
      </main>
      <Footer />
    </>
  );
}
