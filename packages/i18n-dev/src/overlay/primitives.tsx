import { Check, ChevronRight, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

// ─── UI Primitives ──────────────────────────────────────────────────────────

export function FilterPill({
  active,
  onClick,
  variant = 'default',
  children,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  variant?: 'default' | 'error' | 'warning';
  children: ReactNode;
}>) {
  const styles = {
    default: active
      ? 'bg-dt-bg-badge text-dt-text'
      : 'bg-dt-bg-raised text-dt-text-3 hover:text-dt-text-2 hover:bg-dt-bg-hover',
    error: active
      ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
      : 'bg-dt-bg-raised text-dt-text-3 hover:text-red-400 hover:bg-dt-bg-hover',
    warning: active
      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
      : 'bg-dt-bg-raised text-dt-text-3 hover:text-amber-400 hover:bg-dt-bg-hover',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full border-none px-2.5 py-0.5 font-medium text-[10px] transition-all ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, className }: Readonly<{ text: string; className?: string }>) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className={`cursor-pointer border-none bg-transparent p-0.5 text-dt-text-4 transition-colors hover:text-dt-text-2 ${className ?? ''}`}
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: Readonly<{
  icon?: ReactNode;
  title: string;
  description?: string;
}>) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {icon && <div className="mb-3">{icon}</div>}
      <p className="font-medium text-[12px] text-dt-text-3">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[300px] text-[11px] text-dt-text-4 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  color,
}: Readonly<{
  label: string;
  value: string | number;
  color?: 'emerald' | 'amber' | 'red';
}>) {
  const colorMap = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  };
  const textColor = color ? colorMap[color] : 'text-dt-text';
  return (
    <div className="rounded-lg border border-dt-border bg-dt-bg-subtle px-3 py-2">
      <div className="font-medium text-[9px] text-dt-text-3 uppercase tracking-wider">{label}</div>
      <div className={`mt-0.5 font-bold font-mono text-base ${textColor}`}>{value}</div>
    </div>
  );
}

export function NamespaceGroup({
  ns,
  count,
  isCollapsed,
  onToggle,
  children,
}: Readonly<{
  ns: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}>) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer select-none items-center gap-1.5 rounded-md border-none bg-transparent px-1 py-1.5 text-left font-semibold text-[11px] text-dt-text-2 transition-colors hover:bg-dt-bg-hover"
      >
        <ChevronRight
          className={`size-3 shrink-0 text-dt-text-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
        />
        <span className="truncate">{ns}</span>
        <span className="ml-auto shrink-0 rounded-full bg-dt-bg-badge px-1.5 py-px font-medium text-[9px] text-dt-text-3">
          {count}
        </span>
      </button>
      {!isCollapsed && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-dt-border bg-dt-bg-raised px-1 font-sans text-[9px] text-dt-text-3 shadow-[0_1px_0_0_var(--dt-border)]">
      {children}
    </kbd>
  );
}

export function KbdGroup({ keys }: Readonly<{ keys: string[] }>) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, i) => (
        <Kbd key={`${key}-${i}`}>{key}</Kbd>
      ))}
    </span>
  );
}

// ─── Shared constants ─────────────────────────────────────────────────────

/** DOM tags to skip when walking text nodes for translation matching. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
]);

/** Check if a text node's parent should be skipped during translation scanning. */
export function isSkippedParent(el: Element | null): el is null {
  if (!el) {
    return true;
  }
  return el.closest('#i18n-dev-root') !== null || SKIP_TAGS.has(el.tagName);
}

/**
 * Create a MutationObserver that coalesces mutations via requestAnimationFrame.
 * Returns the observer — caller is responsible for calling `.disconnect()`.
 */
export function observeBodyMutations(callback: () => void): MutationObserver {
  let pending = false;
  const obs = new MutationObserver(() => {
    if (pending) {
      return;
    }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      callback();
    });
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  return obs;
}

// ─── Shared utilities ──────────────────────────────────────────────────────

export function openInEditor(source: string) {
  fetch(`/__open-in-editor?file=${encodeURIComponent(source)}`).catch(() => {
    // silently ignore — editor integration may not be available
  });
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

export function groupBy<T>(items: T[], keyFn: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

type StatusColor = 'emerald' | 'amber' | 'red';

function statusColor(pct: number): StatusColor {
  if (pct === 100) {
    return 'emerald';
  }
  return pct > 80 ? 'amber' : 'red';
}

const COLOR_CLASSES: Record<StatusColor, { bar: string; text: string }> = {
  emerald: { bar: 'bg-emerald-400', text: 'text-emerald-400' },
  amber: { bar: 'bg-amber-400', text: 'text-amber-400' },
  red: { bar: 'bg-red-400', text: 'text-red-400' },
};

export function coverageColor(pct: number): StatusColor {
  return statusColor(pct);
}

export function pctColor(pct: number) {
  return COLOR_CLASSES[statusColor(pct)];
}
