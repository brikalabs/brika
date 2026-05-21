import { switchLanguage } from '@brika/i18n/react';
import { AlertTriangle, Globe, MousePointerClick, X } from 'lucide-react';

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
  return parts.join(' + ');
}

function InspectButton({ active, onClick }: Readonly<{ active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? 'Stop inspecting translations'
          : 'Inspect translations — hover to see keys, click to navigate'
      }
      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium text-[10px] transition-all ${
        active
          ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,.15)]'
          : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
      }`}
    >
      <MousePointerClick className={`size-3.5 ${active ? 'text-indigo-400' : ''}`} />
      {active ? 'Inspecting' : 'Inspect'}
      {active && <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />}
    </button>
  );
}

function CiModeButton({ active, onClick }: Readonly<{ active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active ? 'Switch back to translated text' : 'Show raw translation keys in the app (cimode)'
      }
      className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-mono font-semibold text-[10px] transition-all ${
        active
          ? 'border-amber-400/40 bg-amber-500/15 text-amber-300'
          : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
      }`}
    >
      CI
      {active && <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />}
    </button>
  );
}

function MissingButton({
  active,
  runtimeCount,
  onClick,
}: Readonly<{ active: boolean; runtimeCount: number; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? 'Hide missing key markers on page'
          : 'Show missing translation keys directly on the page'
      }
      className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium text-[10px] transition-all ${
        active
          ? 'border-red-400/40 bg-red-500/15 text-red-300'
          : 'border-dt-border bg-dt-bg-raised text-dt-text-3 hover:border-dt-border hover:text-dt-text-2'
      }`}
    >
      <AlertTriangle className={`size-3 ${active ? 'text-red-400' : ''}`} />
      Missing
      {runtimeCount > 0 && !active && (
        <span className="rounded-full bg-red-500/20 px-1 py-px font-semibold text-[8px] text-red-400">
          {runtimeCount}
        </span>
      )}
      {active && <span className="size-1.5 animate-pulse rounded-full bg-red-400" />}
    </button>
  );
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
  const hintVisible = highlight || isCiMode || showMissing;
  const localeOptions = locales.length > 0 ? locales : [currentLang];
  return (
    <div className="border-dt-border border-b">
      <div className="flex items-center justify-between bg-dt-bg-subtle px-3.5 py-2">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-indigo-400" />
          <span className="font-bold text-dt-text text-sm">i18n DevTools</span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className="cursor-pointer rounded-md border border-dt-border bg-dt-bg-raised px-1.5 py-0.5 font-mono font-semibold text-[10px] text-indigo-400 uppercase outline-none transition-colors focus:border-indigo-400/50"
            value={isCiMode ? 'cimode' : currentLang}
            onChange={(e) => {
              void switchLanguage(e.target.value);
            }}
            disabled={isCiMode}
          >
            {localeOptions.map((l) => (
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
      <div className="flex items-center gap-2 bg-dt-bg-subtle px-3.5 py-1.5">
        <InspectButton active={highlight} onClick={onToggleHighlight} />
        <CiModeButton active={isCiMode} onClick={onToggleCiMode} />
        <MissingButton active={showMissing} runtimeCount={runtimeCount} onClick={onToggleMissing} />
        {hintVisible && (
          <span className="ml-auto text-[9px] text-dt-text-4">
            {toolbarHint(highlight, isCiMode, showMissing)}
          </span>
        )}
      </div>
    </div>
  );
}
