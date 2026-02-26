import { Suspense } from 'react';
import { headers } from 'next/headers';
import { Bricks } from '@/components/bricks';
import { Features } from '@/components/features';
import { Footer } from '@/components/footer';
import { Hero } from '@/components/hero';
import { Nav } from '@/components/nav';
import { OpenSource } from '@/components/open-source';
import { Plugins } from '@/components/plugins';
import { QuickStart } from '@/components/quick-start';
import { fetchLatestRelease } from '@/lib/github';
import { fetchWeatherData } from '@/lib/weather';

function PluginsSkeleton() {
  return (
    <section id="plugins" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-6 flex justify-center">
          <div className="h-8 w-40 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mb-2 flex justify-center">
          <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="mb-12 flex justify-center">
          <div className="h-5 w-80 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="marquee-container space-y-5">
        {[0, 1].map((row) => (
          <div key={row} className="flex gap-5 overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-44 w-64 shrink-0 animate-pulse rounded-2xl corner-squircle border border-border bg-surface"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Divider() {
  return (
    <div
      className="mx-auto h-px max-w-xs bg-linear-to-r from-transparent via-border to-transparent"
      aria-hidden
    />
  );
}

export default async function Home() {
  const [release, h] = await Promise.all([fetchLatestRelease(), headers()]);

  const lat = h.get('x-vercel-ip-latitude');
  const lon = h.get('x-vercel-ip-longitude');
  const city = h.get('x-vercel-ip-city');
  const weather = lat && lon && city ? await fetchWeatherData(lat, lon, city) : null;

  return (
    <>
      <Nav />
      <main>
        <Hero release={release} />
        <Divider />
        <QuickStart />
        <Divider />
        <Features />
        <Divider />
        <Bricks weather={weather} />
        <Divider />
        <Suspense fallback={<PluginsSkeleton />}>
          <Plugins />
        </Suspense>
        <Divider />
        <OpenSource />
      </main>
      <Footer />
    </>
  );
}
