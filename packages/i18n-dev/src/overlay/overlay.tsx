import i18next from 'i18next';
import { AlertTriangle, Globe, MousePointerClick, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HighlightOverlay, HighlightTooltip, useHighlightMode } from './highlight';
import {
  useCurrentLocale,
  useHmrValidation,
  useLocales,
  useNavigateEvent,
  useRuntimeMissing,
  useToggleShortcut,
} from './hooks';
import { KbdGroup } from './primitives';
import { RuntimeMarkersOverlay, useRuntimeMarkers } from './runtime-markers';
import { REFERENCE_LOCALE, installTranslationTracker } from './store';
import { CoverageContent } from './coverage-tab';
import { IssuesContent } from './issues-tab';
import { RuntimeContent } from './runtime-tab';
import { TranslationsContent } from './translations-tab';

type Tab = 'issues' | 'runtime' | 'coverage' | 'translations';

// ─── Layout components ──────────────────────────────────────────────────────

export function StatusBar({
  errorCount,
  warnCount,
  runtimeCount,
}: Readonly<{
  errorCount: number;
  warnCount: number;
  runtimeCount: number;
}>) {
  const totalIssues = errorCount + warnCount + runtimeCount;
  return (
    <div className="flex items-center justify-between border-dt-border border-t bg-dt-bg-subtle px-3.5 py-1.5 text-[10px] text-dt-text-3">
      <span>
        {errorCount > 0 && (
          <span className="text-red-400">
            {errorCount} error{errorCount > 1 ? 's' : ''}
          </span>
        )}
        {errorCount > 0 && warnCount > 0 && <span className="text-dt-text-4"> &middot; </span>}
        {warnCount > 0 && (
          <span className="text-amber-400">
            {warnCount} warning{warnCount > 1 ? 's' : ''}
          </span>
        )}
        {(errorCount > 0 || warnCount > 0) && runtimeCount > 0 && (
          <span className="text-dt-text-4"> &middot; </span>
        )}
        {runtimeCount > 0 && <span className="text-red-400">{runtimeCount} runtime</span>}
        {totalIssues === 0 && <span className="text-emerald-400">All translations OK</span>}
      </span>
      <KbdGroup keys={['Shift', 'Alt', 'D']} />
    </div>
  );
}

export function toolbarHint(highlight: boolean, isCiMode: boolean, showMissing: boolean): string {
  const parts: string[] = [];
  if (highlight) {
    parts.push('Inspecting');
  }
  if (isCiMode) {
    parts.push('CI mode');
  }
  if (showMissing) {
    parts.push('Missing keys');
  }
  if (parts.length === 0) {
    return '';
  }
  return parts.join(' + ');
}

export function PanelHeader({
  currentLang,
  locales,
  highlight,
  isCiMode,
  showMissing,
  runtimeCount,
  onToggleHighlight,
  onToggleCiMode,
  onToggleMissing,
  onClose,
}: Readonly<{
  currentLang: string;
  locales: string[];
  highlight: boolean;
  isCiMode: boolean;
  showMissing: boolean;
  runtimeCount: number;
  onToggleHighlight: () => void;
  onToggleCiMode: () => void;
  onToggleMissing: () => void;
  onClose: () => void;
}>) {
  return (
    <div className="border-dt-border border-b">
      {/* Top row: title + controls */}
      <div className="flex items-center justify-between bg-dt-bg-subtle px-3.5 py-2">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-indigo-400" />
          <span className="font-bold text-sm text-dt-text">i18n DevTools</span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className="cursor-pointer rounded-md border border-dt-border bg-dt-bg-raised px-1.5 py-0.5 font-mono font-semibold text-[10px] text-indigo-400 uppercase outline-none transition-colors focus:border-indigo-400/50"
            value={isCiMode ? 'cimode' : currentLang}
            onChange={(e) => i18next.changeLanguage(e.target.value)}
            disabled={isCiMode}
          >
            {(locales.length > 0 ? locales : [currentLang]).map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          <div className="mx-0.5 h-4 w-px bg-dt-bg-badge" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border-none bg-transparent p-1 text-dt-text-3 transition-colors hover:bg-dt-bg-hover hover:text-dt-text"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {/* Toolbar row: inspect + cimode */}
      <div className="flex items-center gap-2 bg-dt-bg-subtle px-3.5 py-1.5">
        <button
          type="button"
          onClick={onToggleHighlight}
          title={
            highlight
              ? 'Stop inspecting translations'
              : 'Inspect translations \u2014 hover to see keys, click to navigate'
          }
          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium text-[10px] transition-all ${
            highlight
              ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,.15)]'
              : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
          }`}
        >
          <MousePointerClick className={`size-3.5 ${highlight ? 'text-indigo-400' : ''}`} />
          {highlight ? 'Inspecting' : 'Inspect'}
          {highlight && <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />}
        </button>
        <button
          type="button"
          onClick={onToggleCiMode}
          title={
            isCiMode
              ? 'Switch back to translated text'
              : 'Show raw translation keys in the app (cimode)'
          }
          className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-mono font-semibold text-[10px] transition-all ${
            isCiMode
              ? 'border-amber-400/40 bg-amber-500/15 text-amber-300'
              : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
          }`}
        >
          CI
          {isCiMode && <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />}
        </button>
        <button
          type="button"
          onClick={onToggleMissing}
          title={
            showMissing
              ? 'Hide missing key markers on page'
              : 'Show missing translation keys directly on the page'
          }
          className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium text-[10px] transition-all ${
            showMissing
              ? 'border-red-400/40 bg-red-500/15 text-red-300'
              : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
          }`}
        >
          <AlertTriangle className={`size-3 ${showMissing ? 'text-red-400' : ''}`} />
          Missing
          {runtimeCount > 0 && !showMissing && (
            <span className="rounded-full bg-red-500/20 px-1 py-px font-semibold text-[8px] text-red-400">
              {runtimeCount}
            </span>
          )}
          {showMissing && <span className="size-1.5 animate-pulse rounded-full bg-red-400" />}
        </button>
        {(highlight || isCiMode || showMissing) && (
          <span className="ml-auto text-[9px] text-dt-text-4">
            {toolbarHint(highlight, isCiMode, showMissing)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────────────────────

export function TabBar({
  tabs,
  active,
  onSelect,
}: Readonly<{
  tabs: { id: Tab; label: string; count?: number }[];
  active: Tab;
  onSelect: (tab: Tab) => void;
}>) {
  return (
    <div className="flex gap-px border-dt-border border-b bg-dt-bg-subtle px-2.5 pt-1">
      {tabs.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`relative cursor-pointer border-none bg-transparent px-3 pt-1.5 pb-2 font-medium text-[11px] transition-colors ${
            active === t.id ? 'text-dt-text' : 'text-dt-text-3 hover:text-dt-text-2'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {t.label}
            {t.count != null && (
              <span
                className={`rounded-full px-1.5 py-px font-semibold text-[9px] ${
                  active === t.id ? 'bg-indigo-500/20 text-indigo-400' : 'bg-dt-bg-badge text-dt-text-3'
                }`}
              >
                {t.count}
              </span>
            )}
          </span>
          {active === t.id && (
            <span className="absolute right-0 bottom-0 left-0 h-[2px] rounded-t-full bg-indigo-400" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Floating badge (collapsed state) ───────────────────────────────────────

export function FloatingBadge({
  totalIssues,
  errorCount,
  warnCount,
  runtimeCount,
  currentLang,
  onOpen,
}: Readonly<{
  totalIssues: number;
  errorCount: number;
  warnCount: number;
  runtimeCount: number;
  currentLang: string;
  onOpen: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`fixed right-4 bottom-4 z-[2147483647] flex cursor-pointer select-none items-center gap-1.5 rounded-full border-none px-3.5 py-1.5 font-mono font-semibold text-white text-xs shadow-lg transition-all hover:scale-105 ${
        totalIssues > 0 ? 'bg-red-600 shadow-red-600/25' : 'bg-emerald-600 shadow-emerald-600/20'
      }`}
      title={`i18n: ${errorCount} errors, ${warnCount} warnings, ${runtimeCount} runtime \u2014 Shift+Alt+D`}
    >
      <Globe className="size-3.5" />
      <span>{totalIssues > 0 ? totalIssues : 'OK'}</span>
      <span className="rounded bg-white/15 px-1 py-px font-medium text-[9px] uppercase">
        {currentLang}
      </span>
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

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
      i18next.changeLanguage(preCiLang ?? REFERENCE_LOCALE);
    } else {
      setPreCiLang(currentLang);
      i18next.changeLanguage('cimode');
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
      if (i.severity === 'error') errors++;
      else warnings++;
    }
    return { errorCount: errors, warnCount: warnings };
  }, [issues]);
  const runtimeCount = runtime.size;
  const totalIssues = errorCount + warnCount + runtimeCount;
  const runtimeEntries = useMemo(() => [...runtime.values()], [runtime]);
  const runtimeMarkers = useRuntimeMarkers(runtimeEntries, showMissing && !isCiMode);
  const locales = useLocales();

  const tabDefs: { id: Tab; label: string; count?: number }[] = [
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
        <div className="fixed right-4 bottom-4 z-[2147483647] flex max-h-[600px] w-[520px] flex-col overflow-hidden rounded-xl border border-dt-border bg-dt-bg font-sans text-xs text-dt-text shadow-dt">
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
