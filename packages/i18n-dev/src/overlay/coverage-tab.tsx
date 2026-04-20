import { BarChart3, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import type { CoverageEntry } from '../types';
import { useToggleSet } from './hooks';
import { coverageColor, EmptyState, pctColor, StatCard } from './primitives';

function CoverageStats({ coverage }: Readonly<{ coverage: CoverageEntry[] }>) {
  const stats = useMemo(() => {
    const locales = new Set(coverage.map((c) => c.locale));
    const namespaces = new Set(coverage.map((c) => c.namespace));
    const totalKeys = coverage.reduce((sum, c) => sum + c.totalKeys, 0);
    const translatedKeys = coverage.reduce((sum, c) => sum + c.translatedKeys, 0);
    const avgPct = totalKeys > 0 ? Math.round((translatedKeys / totalKeys) * 100) : 100;
    return { localeCount: locales.size, nsCount: namespaces.size, avgPct };
  }, [coverage]);

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      <StatCard label="Locales" value={stats.localeCount} />
      <StatCard label="Namespaces" value={stats.nsCount} />
      <StatCard
        label="Avg Coverage"
        value={`${stats.avgPct}%`}
        color={coverageColor(stats.avgPct)}
      />
    </div>
  );
}

function LocaleCard({
  locale,
  total,
  translated,
  entries,
  isExpanded,
  onToggle,
}: Readonly<{
  locale: string;
  total: number;
  translated: number;
  entries: CoverageEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}>) {
  const pct = total > 0 ? Math.round((translated / total) * 100) : 100;
  const c = pctColor(pct);
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-dt-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-dt-bg-subtle px-3 py-2.5 text-left transition-colors hover:bg-dt-bg-hover"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-dt-text-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span className="w-8 font-semibold text-xs uppercase">{locale}</span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-dt-progress-bg">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${c.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`w-10 text-right font-mono font-semibold text-xs ${c.text}`}>{pct}%</span>
        <span className="w-16 text-right text-[10px] text-dt-text-4">
          {translated}/{total}
        </span>
      </button>
      {isExpanded && (
        <div className="space-y-1 border-dt-border border-t px-3 py-2">
          {[...entries]
            .sort((a, b) => a.percentage - b.percentage)
            .map((entry) => {
              const ec = pctColor(entry.percentage);
              return (
                <div key={entry.namespace} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 shrink-0 truncate text-dt-text-3" title={entry.namespace}>
                    {entry.namespace}
                  </span>
                  <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-dt-progress-bg">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${ec.bar}`}
                      style={{ width: `${entry.percentage}%` }}
                    />
                  </div>
                  <span className={`w-9 shrink-0 text-right font-mono text-[10px] ${ec.text}`}>
                    {entry.percentage}%
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export function CoverageContent({ coverage }: Readonly<{ coverage: CoverageEntry[] }>) {
  const { set: expanded, toggle } = useToggleSet();

  const byLocale = useMemo(() => {
    const map = new Map<string, { total: number; translated: number; entries: CoverageEntry[] }>();
    for (const entry of coverage) {
      const agg = map.get(entry.locale) ?? { total: 0, translated: 0, entries: [] };
      agg.total += entry.totalKeys;
      agg.translated += entry.translatedKeys;
      agg.entries.push(entry);
      map.set(entry.locale, agg);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [coverage]);

  if (coverage.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-8 text-dt-text-4" />}
        title="No coverage data"
        description="Coverage data will appear once the validation engine processes your locale files."
      />
    );
  }

  return (
    <>
      <CoverageStats coverage={coverage} />
      <div className="mb-2 font-medium text-[10px] text-dt-text-3 uppercase tracking-wider">
        By Locale
      </div>
      {byLocale.map(([locale, agg]) => (
        <LocaleCard
          key={locale}
          locale={locale}
          total={agg.total}
          translated={agg.translated}
          entries={agg.entries}
          isExpanded={expanded.has(locale)}
          onToggle={() => toggle(locale)}
        />
      ))}
    </>
  );
}
