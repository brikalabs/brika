/**
 * ControlSection — numbered collapsible section used by ControlsPanel.
 *
 * Layout:
 *   [01]  Typography                        · hint        ⌄
 *   ──── body (indented under the number) ────
 *
 * The number chip gives quick wayfinding when scrolling; the chevron
 * shows collapsed state. Open/closed state persists per `id` in
 * sessionStorage so the panel keeps its shape.
 */

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface ControlSectionProps {
  id: string;
  index: number;
  title: ReactNode;
  hint?: string;
  defaultOpen?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}

const STORAGE_KEY = 'brika.theme-builder.sections';

function readOpenMap(): Record<string, boolean> {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeOpenMap(map: Record<string, boolean>): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function ControlSection({
  id,
  index,
  title,
  hint,
  defaultOpen = true,
  trailing,
  children,
}: Readonly<ControlSectionProps>) {
  const [open, setOpen] = useState<boolean>(() => {
    const map = readOpenMap();
    return id in map ? map[id] : defaultOpen;
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      const map = readOpenMap();
      map[id] = next;
      writeOpenMap(map);
      return next;
    });
  }, [id]);

  return (
    <section className="border-b last:border-b-0">
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors"
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-muted font-medium font-mono text-[10px] text-muted-foreground tabular-nums">
            {String(index).padStart(2, '0')}
          </span>
          <span className="truncate font-medium text-sm">{title}</span>
          {hint && <span className="truncate text-[10px] text-muted-foreground">· {hint}</span>}
          <ChevronDown
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              !open && '-rotate-90'
            )}
          />
        </button>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </header>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}
