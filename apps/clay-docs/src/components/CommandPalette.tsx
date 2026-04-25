import { ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sitePages } from '~/lib/site-pages';

const OPEN_EVENT = 'clay-open-palette';

function matches(query: string, page: (typeof sitePages)[number]): boolean {
  if (query.length === 0) {
    return true;
  }
  const haystack = [page.label, page.group, ...(page.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Global Cmd+K / Ctrl+K command palette. Opens via keyboard shortcut OR a
 * `clay-open-palette` custom event (fired by the sidebar search button).
 *
 * Renders a filtered list of every page in the sitePages registry.
 * Arrow keys navigate, Enter opens the selection, Escape closes.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Drive the native <dialog>'s open state imperatively. `showModal()`
  // wires up Escape-to-close + focus trap; the `close` event syncs back
  // to React state when the user dismisses with Escape or close().
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const filtered = useMemo(() => sitePages.filter((page) => matches(query, page)), [query]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((previous) => !previous);
        return;
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    const onOpenEvent = () => setOpen(true);
    globalThis.addEventListener('keydown', onKeydown);
    globalThis.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      globalThis.removeEventListener('keydown', onKeydown);
      globalThis.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [activeIndex, filtered.length]);

  const navigate = (href: string) => {
    setOpen(false);
    globalThis.location.href = href;
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((previous) => Math.min(previous + 1, filtered.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((previous) => Math.max(previous - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filtered[activeIndex];
      if (selected) {
        navigate(selected.href);
      }
    }
  };

  const groups = new Map<string, typeof sitePages>();
  for (const page of filtered) {
    const bucket = groups.get(page.group);
    if (bucket) {
      groups.set(page.group, [...bucket, page]);
    } else {
      groups.set(page.group, [page]);
    }
  }

  let visualIndex = -1;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onClose={() => setOpen(false)}
      className="m-0 max-h-none max-w-none rounded-none border-0 bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm open:fixed open:inset-0 open:z-50 open:flex open:items-start open:justify-center open:px-4 open:pt-[15vh]"
    >
      {/* Backdrop close — a real <button> filling the dialog so click-
          outside dismisses without putting a click handler on the
          (lint-considered-non-interactive) <dialog> itself. */}
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="fixed inset-0 -z-10 cursor-default"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated shadow-2xl">
        <div className="flex items-center gap-3 border-clay-hairline border-b px-4 py-3">
          <Search size={16} className="text-clay-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages and components…"
            aria-label="Search pages and components"
            className="flex-1 bg-transparent font-sans text-clay-default text-sm outline-none placeholder:text-clay-inactive"
          />
          <kbd className="rounded border border-clay-hairline bg-clay-base px-1.5 py-0.5 font-mono text-[0.625rem] text-clay-subtle">
            Esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-clay-subtle text-sm">
              No pages match "{query}"
            </p>
          ) : (
            Array.from(groups.entries()).map(([group, pages]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-4 py-1 font-medium font-mono text-[0.625rem] text-clay-subtle uppercase tracking-wider">
                  {group}
                </p>
                <ul>
                  {pages.map((page) => {
                    visualIndex += 1;
                    const active = visualIndex === activeIndex;
                    const index = visualIndex;
                    return (
                      <li key={page.href}>
                        <button
                          type="button"
                          onClick={() => navigate(page.href)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={
                            active
                              ? 'flex w-full items-center gap-3 bg-clay-control px-4 py-2 text-left text-clay-strong text-sm'
                              : 'flex w-full items-center gap-3 px-4 py-2 text-left text-clay-default text-sm transition-colors hover:bg-clay-control'
                          }
                        >
                          <span className="flex-1">{page.label}</span>
                          <ArrowRight
                            size={14}
                            className={active ? 'text-clay-default' : 'text-clay-inactive'}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-clay-hairline border-t bg-clay-base px-4 py-2 font-mono text-[0.625rem] text-clay-subtle">
          <span>
            <kbd className="mr-1 rounded border border-clay-hairline bg-clay-elevated px-1">↑</kbd>{' '}
            <kbd className="mr-1 rounded border border-clay-hairline bg-clay-elevated px-1">↓</kbd>{' '}
            to navigate
          </span>
          <span>
            <kbd className="mr-1 rounded border border-clay-hairline bg-clay-elevated px-1">↵</kbd>{' '}
            to open
          </span>
        </div>
      </div>
    </dialog>
  );
}
