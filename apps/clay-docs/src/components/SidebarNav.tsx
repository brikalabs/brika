import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { comingSoonComponents, sitePages } from '~/lib/site-pages';
import { ClayMenuIcon } from './ClayMenuIcon';

const STORAGE_KEY = 'clay-sidebar-open';
const OPEN_PALETTE_EVENT = 'clay-open-palette';

function normalise(pathname: string): string {
  if (pathname.length === 0) {
    return '/';
  }
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

function isActive(activePath: string, href: string): boolean {
  return activePath === normalise(href);
}

function openPalette() {
  globalThis.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export function SidebarNav({ currentPath }: { readonly currentPath: string }) {
  const active = normalise(currentPath);
  const [open, setOpen] = useState(true);
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl K');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') {
      setOpen(false);
    }
    const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
    setShortcutLabel(isMac ? '⌘ K' : 'Ctrl K');
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
  };

  const pages = sitePages.filter((page) => page.group === 'Pages');
  const components = sitePages.filter((page) => page.group === 'Components');

  return (
    <aside
      data-sidebar-open={open ? 'true' : 'false'}
      className="fixed top-0 left-0 z-30 flex h-screen"
      aria-label="Primary navigation"
    >
      {/* Collapsed rail */}
      <div className="flex w-12 shrink-0 flex-col items-center border-clay-hairline border-r bg-clay-canvas py-3">
        <a
          href="/"
          className="mb-3 inline-flex size-8 items-center justify-center rounded text-clay-default transition-colors hover:bg-clay-control"
          aria-label="Clay home"
        >
          <ClayMenuIcon size={22} />
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={open}
          className="inline-flex size-8 items-center justify-center rounded text-clay-subtle transition-colors hover:bg-clay-control hover:text-clay-default"
        >
          {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Expanded panel */}
      {open && (
        <div
          data-sidebar-scroll
          className="flex w-64 flex-col border-clay-hairline border-r bg-clay-canvas"
        >
          <div className="border-clay-hairline border-b px-4 py-3">
            <button
              type="button"
              onClick={openPalette}
              className="inline-flex w-full items-center gap-2 rounded border border-clay-hairline bg-clay-base px-2.5 py-1.5 text-clay-subtle text-sm transition-colors hover:bg-clay-control hover:text-clay-default"
              aria-label="Open command palette"
            >
              <Search size={14} aria-hidden="true" />
              <span>Search…</span>
              <kbd className="ml-auto rounded border border-clay-hairline bg-clay-canvas px-1 py-0.5 font-mono text-[0.625rem]">
                {shortcutLabel}
              </kbd>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ul className="space-y-0.5">
              {pages.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={
                      isActive(active, item.href)
                        ? 'block rounded bg-clay-control px-2 py-1 font-medium text-clay-strong text-sm'
                        : 'block rounded px-2 py-1 text-clay-default text-sm transition-colors hover:bg-clay-control'
                    }
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            <p className="mt-6 mb-2 px-2 font-medium font-mono text-[0.6875rem] text-clay-subtle uppercase tracking-wider">
              Components
            </p>
            <ul className="space-y-0.5">
              {components.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={
                      isActive(active, item.href)
                        ? 'block rounded bg-clay-control px-2 py-1 font-medium text-clay-strong text-sm'
                        : 'block rounded px-2 py-1 text-clay-default text-sm transition-colors hover:bg-clay-control'
                    }
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              {comingSoonComponents.map((label) => (
                <li key={label}>
                  <span className="block cursor-not-allowed rounded px-2 py-1 text-clay-inactive text-sm">
                    {label}
                    <span className="ml-2 font-mono text-[0.625rem] text-clay-inactive">soon</span>
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </aside>
  );
}
