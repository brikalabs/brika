import { Avatar, AvatarFallback, AvatarImage, Button, Skeleton } from '@brika/clay';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Download, Package, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useStorePlugins, useVerifiedPlugins } from '@/features/store/hooks';
import type { PluginSearchResult } from '@/features/store/types';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

const MAX_STARTERS = 3;
const SKELETON_KEYS = ['skeleton-a', 'skeleton-b', 'skeleton-c'] as const;

interface PluginsEmptyStarterProps {
  onInstall: (packageName: string) => void;
}

export function PluginsEmptyStarter({ onInstall }: Readonly<PluginsEmptyStarterProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const { data: verifiedData, isLoading: verifiedLoading } = useVerifiedPlugins();
  const { data: searchData, isLoading: searchLoading } = useStorePlugins({ limit: 50 });

  const starters = useMemo<PluginSearchResult[]>(() => {
    if (!searchData) {
      return [];
    }
    const featured = new Set(
      verifiedData?.plugins.filter((p) => p.featured).map((p) => p.name) ?? []
    );
    const verified = new Set(verifiedData?.plugins.map((p) => p.name) ?? []);

    // De-duplicate by package name. Some registries can return the same
    // package twice (different sources), and we never want to recommend the
    // same plugin more than once. Keep the first occurrence after ranking.
    const seen = new Set<string>();
    const ranked = [...searchData.plugins]
      .filter((p) => !p.installed && p.compatible)
      .sort((a, b) => {
        const af = featured.has(a.package.name) ? 1 : 0;
        const bf = featured.has(b.package.name) ? 1 : 0;
        if (af !== bf) {
          return bf - af;
        }
        const av = verified.has(a.package.name) ? 1 : 0;
        const bv = verified.has(b.package.name) ? 1 : 0;
        if (av !== bv) {
          return bv - av;
        }
        return b.downloadCount - a.downloadCount;
      })
      .filter((p) => {
        if (seen.has(p.package.name)) {
          return false;
        }
        seen.add(p.package.name);
        return true;
      });

    return ranked.slice(0, MAX_STARTERS);
  }, [searchData, verifiedData]);

  const isLoading = verifiedLoading || searchLoading;

  return (
    <section className="flex flex-col items-center gap-10 py-6">
      <Hero t={t} />

      <div className="grid w-full max-w-3xl gap-4 md:grid-cols-3">
        {isLoading
          ? SKELETON_KEYS.map((key) => <StarterSkeleton key={key} />)
          : starters.map((starter) => (
              <StarterCard key={starter.package.name} starter={starter} onInstall={onInstall} />
            ))}
      </div>

      <Link
        to={paths.store.list.path}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        onClick={() => capture('plugins.browse_store_clicked', { source: 'empty_starter' })}
      >
        {t('plugins:starter.browseAll')}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({ t }: Readonly<{ t: ReturnType<typeof useLocale>['t'] }>) {
  return (
    <header className="flex max-w-md flex-col items-center gap-3 text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
        <div className="relative flex size-12 items-center justify-center rounded-xl bg-gradient-to-b from-primary to-primary/80 shadow-lg shadow-primary/30 ring-1 ring-white/10">
          <Sparkles className="size-5 text-white" />
        </div>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
        {t('plugins:starter.eyebrow')}
      </span>
      <h2 className="font-semibold text-[24px] text-foreground leading-[1.15] tracking-tight">
        {t('plugins:starter.title')}
      </h2>
      <p className="text-[13.5px] text-muted-foreground leading-relaxed">
        {t('plugins:starter.description')}
      </p>
    </header>
  );
}

// ─── Starter card ───────────────────────────────────────────────────────────

interface StarterCardProps {
  starter: PluginSearchResult;
  onInstall: (packageName: string) => void;
}

function StarterCard({ starter, onInstall }: Readonly<StarterCardProps>) {
  const { t, tp } = useLocale();
  const capture = useCapture();
  const pkg = starter.package;
  const displayName = tp(pkg.name, 'name', pkg.displayName ?? humanize(pkg.name));
  const description = tp(pkg.name, 'description', pkg.description ?? '');

  return (
    <div className="group flex flex-col gap-4 rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/10">
      <Avatar className="size-12 rounded-xl ring-1 ring-border/50">
        <AvatarImage
          src={`/api/registry/plugins/${encodeURIComponent(pkg.name)}/icon`}
          className="object-cover"
        />
        <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-background">
          <Package className="size-5 text-primary/70" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-1.5">
        <h3 className="font-semibold text-[15px] text-foreground tracking-tight">{displayName}</h3>
        <code className="block truncate font-mono text-[11px] text-muted-foreground/80">
          {pkg.name}
        </code>
        {description && (
          <p className="line-clamp-3 pt-1 text-[12.5px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full justify-center gap-1.5 transition-colors group-hover:border-foreground/20"
        onClick={() => {
          capture('plugins.install_dialog_opened', {
            source: 'starter',
          });
          onInstall(pkg.name);
        }}
      >
        <Download className="size-3.5" />
        {t('plugins:starter.install')}
      </Button>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function StarterSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/40 p-5">
      <Skeleton className="size-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton className="h-8 w-full rounded-md" />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Turn `@brika/plugin-timer` into `Timer`, `@scope/plugin-foo-bar` into `Foo bar`. */
function humanize(packageName: string): string {
  const slug = packageName.split('/').pop() ?? packageName;
  const tail = slug.replace(/^plugin-/, '');
  if (!tail) {
    return packageName;
  }
  const spaced = tail.replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
