import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  COMPONENT_GROUPS,
  COMPONENTS,
  type ComponentEntry,
  type ComponentGroup,
} from '~/lib/component-registry';
import { sitePages } from '~/lib/site-pages';
import { ClayMenuIcon } from './ClayMenuIcon';

const STORAGE_KEY = 'clay-sidebar-open';
const COLLAPSED_GROUPS_KEY = 'clay-sidebar-collapsed-groups';
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

const groupedComponents: ReadonlyMap<ComponentGroup, readonly ComponentEntry[]> = new Map(
  COMPONENT_GROUPS.map((group) => [group, COMPONENTS.filter((c) => c.group === group)])
);

function readCollapsedGroups(): ReadonlySet<ComponentGroup> {
  if (typeof localStorage === 'undefined') {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    const valid = new Set<ComponentGroup>();
    for (const entry of parsed) {
      if (typeof entry === 'string' && (COMPONENT_GROUPS as readonly string[]).includes(entry)) {
        valid.add(entry as ComponentGroup);
      }
    }
    return valid;
  } catch {
    return new Set();
  }
}

export function SidebarNav({ currentPath }: { readonly currentPath: string }) {
  const active = normalise(currentPath);
  const [open, setOpen] = useState(true);
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl K');
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<ComponentGroup>>(
    () => new Set()
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') {
      setOpen(false);
    }
    const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
    setShortcutLabel(isMac ? '⌘ K' : 'Ctrl K');
    setCollapsedGroups(readCollapsedGroups());
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
  };

  const toggleGroup = (group: ComponentGroup) => {
    const next = new Set(collapsedGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    setCollapsedGroups(next);
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable — keep in-memory only.
    }
  };

  const pages = sitePages.filter((page) => page.group === 'Pages');
  const allComponentsHref = '/components';

  const navItemClass = (href: string) =>
    isActive(active, href)
      ? 'block rounded bg-clay-control px-2 py-1 font-medium text-clay-strong text-sm'
      : 'block rounded px-2 py-1 text-clay-default text-sm transition-colors hover:bg-clay-control';

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
                  <a href={item.href} className={navItemClass(item.href)}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-6 mb-2 flex items-baseline justify-between px-2">
              <p className="font-medium font-mono text-[0.6875rem] text-clay-subtle uppercase tracking-wider">
                Components
              </p>
              <a
                href={allComponentsHref}
                className={
                  isActive(active, allComponentsHref)
                    ? 'font-medium text-clay-strong text-xs'
                    : 'text-clay-subtle text-xs transition-colors hover:text-clay-default'
                }
              >
                all
              </a>
            </div>

            {COMPONENT_GROUPS.map((group) => {
              const items = groupedComponents.get(group) ?? [];
              if (items.length === 0) {
                return null;
              }
              const collapsed = collapsedGroups.has(group);
              return (
                <div key={group} className="mb-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={!collapsed}
                    className="flex w-full items-center justify-between rounded px-2 py-1 font-medium font-mono text-[0.625rem] text-clay-inactive uppercase tracking-wider transition-colors hover:bg-clay-control hover:text-clay-subtle"
                  >
                    <span>{group}</span>
                    <ChevronDown
                      size={11}
                      className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {!collapsed && (
                    <ul className="mt-1 space-y-0.5">
                      {items.map((component) => (
                        <li key={component.slug}>
                          <a
                            href={`/components/${component.slug}`}
                            className={navItemClass(`/components/${component.slug}`)}
                          >
                            {component.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
}
