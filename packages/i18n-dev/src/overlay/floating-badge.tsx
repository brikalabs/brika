import { Globe } from 'lucide-react';

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
      title={`i18n: ${errorCount} errors, ${warnCount} warnings, ${runtimeCount} runtime — Shift+Alt+D`}
    >
      <Globe className="size-3.5" />
      <span>{totalIssues > 0 ? totalIssues : 'OK'}</span>
      <span className="rounded bg-white/15 px-1 py-px font-medium text-[9px] uppercase">
        {currentLang}
      </span>
    </button>
  );
}
