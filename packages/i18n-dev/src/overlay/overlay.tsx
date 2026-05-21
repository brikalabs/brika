import { switchLanguage } from '@brika/i18n/react';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CoverageContent } from './coverage-tab';
import { FloatingBadge } from './floating-badge';
import { HighlightOverlay, HighlightTooltip, useHighlightMode } from './highlight';
import {
  useCurrentLocale,
  useHmrValidation,
  useLocales,
  useNavigateEvent,
  useRuntimeMissing,
  useToggleShortcut,
} from './hooks';
import { IssuesContent } from './issues-tab';
import { PanelHeader } from './panel-header';
import { RuntimeMarkersOverlay, useRuntimeMarkers } from './runtime-markers';
import { RuntimeContent } from './runtime-tab';
import { StatusBar } from './status-bar';
import { getReferenceLocale, installTranslationTracker } from './store';
import { type Tab, TabBar, type TabDef } from './tab-bar';
import { TranslationsContent } from './translations-tab';

// Re-export so existing tests that import these from `./overlay` keep working.
export { FloatingBadge } from './floating-badge';
export { PanelHeader, toolbarHint } from './panel-header';
export { StatusBar } from './status-bar';
export { TabBar } from './tab-bar';

export function I18nDevOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('issues');
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [navigateTarget, setNavigateTarget] = useState<string | null>(null);
  const [preCiLang, setPreCiLang] = useState<string | null>(null);

  useEffect(() => {
    installTranslationTracker();
  }, []);

  const validation = useHmrValidation();
  const { runtime, clearRuntime } = useRuntimeMissing();
  const currentLang = useCurrentLocale();
  const isCiMode = currentLang === 'cimode';

  const toggleCiMode = useCallback(() => {
    if (isCiMode) {
      switchLanguage(preCiLang ?? getReferenceLocale()).catch(() => undefined);
    } else {
      setPreCiLang(currentLang);
      switchLanguage('cimode').catch(() => undefined);
    }
  }, [isCiMode, preCiLang, currentLang]);
  const togglePanel = useCallback(() => setIsOpen((v) => !v), []);
  useToggleShortcut(togglePanel);
  const highlightHover = useHighlightMode(highlight);

  useNavigateEvent((key) => {
    setIsOpen(true);
    setTab('translations');
    setFilter(key);
    setNavigateTarget(key);
  });

  const issues = validation?.issues ?? [];
  const coverage = validation?.coverage ?? [];
  const { errorCount, warnCount } = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const i of issues) {
      if (i.severity === 'error') {
        errors++;
      } else {
        warnings++;
      }
    }
    return { errorCount: errors, warnCount: warnings };
  }, [issues]);
  const runtimeCount = runtime.size;
  const totalIssues = errorCount + warnCount + runtimeCount;
  const runtimeEntries = useMemo(() => [...runtime.values()], [runtime]);
  const runtimeMarkers = useRuntimeMarkers(runtimeEntries, showMissing && !isCiMode);
  const locales = useLocales();

  const tabDefs: TabDef[] = [
    { id: 'issues', label: 'Issues', count: errorCount + warnCount || undefined },
    { id: 'runtime', label: 'Runtime', count: runtimeCount || undefined },
    { id: 'coverage', label: 'Coverage' },
    { id: 'translations', label: 'Keys' },
  ];

  const handleTabSelect = useCallback((id: Tab) => {
    setTab(id);
    setFilter('');
    setNavigateTarget(null);
  }, []);

  return (
    <>
      {highlightHover && <HighlightOverlay hover={highlightHover} />}
      {highlightHover && <HighlightTooltip hover={highlightHover} />}
      <RuntimeMarkersOverlay markers={runtimeMarkers} />
      {isOpen ? (
        <div className="fixed right-4 bottom-4 z-[2147483647] flex max-h-[600px] w-[520px] flex-col overflow-hidden rounded-xl border border-dt-border bg-dt-bg font-sans text-dt-text text-xs shadow-dt">
          <PanelHeader
            currentLang={currentLang}
            locales={locales}
            highlight={highlight}
            isCiMode={isCiMode}
            showMissing={showMissing}
            runtimeCount={runtimeCount}
            onToggleHighlight={() => setHighlight((v) => !v)}
            onToggleCiMode={toggleCiMode}
            onToggleMissing={() => setShowMissing((v) => !v)}
            onClose={() => setIsOpen(false)}
          />

          <TabBar tabs={tabDefs} active={tab} onSelect={handleTabSelect} />

          {tab !== 'coverage' && (
            <div className="px-3 pt-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-dt-text-4" />
                <input
                  className="w-full rounded-lg border border-dt-border bg-dt-bg-hover py-1.5 pr-2.5 pl-8 font-mono text-[11px] text-dt-text outline-none transition-colors placeholder:text-dt-text-4 focus:border-indigo-400/40 focus:bg-dt-bg-hover"
                  placeholder="Filter by key or namespace..."
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setNavigateTarget(null);
                  }}
                />
              </div>
            </div>
          )}

          <div className="scrollbar-thin scrollbar-thumb-dt-bg-badge max-h-96 min-h-40 flex-1 overflow-auto px-3 py-2.5">
            {tab === 'issues' && <IssuesContent issues={issues} filter={filter} />}
            {tab === 'runtime' && (
              <RuntimeContent entries={runtimeEntries} filter={filter} onClear={clearRuntime} />
            )}
            {tab === 'coverage' && <CoverageContent coverage={coverage} />}
            {tab === 'translations' && (
              <TranslationsContent
                filter={filter}
                locales={locales}
                navigateTarget={navigateTarget}
              />
            )}
          </div>

          <StatusBar errorCount={errorCount} warnCount={warnCount} runtimeCount={runtimeCount} />
        </div>
      ) : (
        <FloatingBadge
          totalIssues={totalIssues}
          errorCount={errorCount}
          warnCount={warnCount}
          runtimeCount={runtimeCount}
          currentLang={currentLang}
          onOpen={() => setIsOpen(true)}
        />
      )}
    </>
  );
}
