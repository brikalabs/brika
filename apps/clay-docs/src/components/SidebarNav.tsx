import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClayMenuIcon } from './ClayMenuIcon';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

const staticPages: readonly NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Installation', href: '/installation' },
  { label: 'Colors', href: '/colors' },
];

const components: readonly NavItem[] = [{ label: 'Button', href: '/components/button' }];

const comingSoonComponents: readonly string[] = [
  'Input',
  'Card',
  'Label',
  'Badge',
  'Separator',
  'Dialog',
  'Tooltip',
  'Tabs',
];

const STORAGE_KEY = 'clay-sidebar-open';

function normalise(pathname: string): string {
  if (pathname.length === 0) {
    return '/';
  }
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

function isActive(activePath: string, href: string): boolean {
  const normalised = normalise(href);
  if (normalised === '/') {
    return activePath === '/';
  }
  return activePath === normalised || activePath.startsWith(`${normalised}/`);
}

export function SidebarNav({ currentPath }: { readonly currentPath: string }) {
  const active = normalise(currentPath);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') {
      setOpen(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
  };

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
              className="inline-flex w-full items-center gap-2 rounded border border-clay-hairline bg-clay-base px-2.5 py-1.5 text-clay-subtle text-sm transition-colors hover:bg-clay-control"
              aria-label="Search components (coming soon)"
              disabled
            >
              <Search size={14} aria-hidden="true" />
              <span>Search…</span>
              <kbd className="ml-auto rounded border border-clay-hairline bg-clay-canvas px-1 py-0.5 font-mono text-[0.625rem]">
                ⌘K
              </kbd>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ul className="space-y-0.5">
              {staticPages.map((item) => (
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
