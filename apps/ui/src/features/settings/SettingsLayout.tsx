import { Scope } from '@brika/auth';
import { useCanAccess } from '@brika/auth/react';
import { cn } from '@brika/clay';
import { Link, Navigate, Outlet, useMatchRoute, useRouterState } from '@tanstack/react-router';
import {
  Clock,
  Globe,
  Info,
  Languages,
  type LucideIcon,
  MapPin,
  Palette,
  Server,
} from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings:nav.groups.preferences',
    items: [
      { to: paths.settings.appearance.path, labelKey: 'settings:nav.appearance', icon: Palette },
      { to: paths.settings.language.path, labelKey: 'settings:nav.language', icon: Languages },
      { to: paths.settings.time.path, labelKey: 'settings:nav.time', icon: Clock },
    ],
  },
  {
    labelKey: 'settings:nav.groups.workspace',
    items: [
      {
        to: paths.settings.location.path,
        labelKey: 'settings:nav.location',
        icon: MapPin,
        adminOnly: true,
      },
      {
        to: paths.settings.hub.path,
        labelKey: 'settings:nav.hub',
        icon: Server,
        adminOnly: true,
      },
      {
        to: paths.settings.remoteAccess.path,
        labelKey: 'settings:nav.remoteAccess',
        icon: Globe,
        adminOnly: true,
      },
      {
        to: paths.settings.system.path,
        labelKey: 'settings:nav.system',
        icon: Info,
        adminOnly: true,
      },
    ],
  },
];

// ─── Sidebar ────────────────────────────────────────────────────────────────

function SidebarLink({ item }: Readonly<{ item: NavItem }>) {
  const matchRoute = useMatchRoute();
  const { t } = useLocale();
  const isActive = !!matchRoute({ to: item.to, fuzzy: true });
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      className={cn(
        'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium text-[13px] transition-all',
        isActive
          ? 'bg-foreground/[0.06] text-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'size-4 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
        )}
      />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

function SidebarGroupComponent({ group }: Readonly<{ group: NavGroup }>) {
  const { t } = useLocale();
  const isAdmin = useCanAccess(Scope.ADMIN_ALL);
  const items = group.items.filter((item) => !item.adminOnly || isAdmin);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="px-2.5 pb-1 font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.16em]">
        {t(group.labelKey)}
      </p>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export function SettingsLayout() {
  const { t } = useLocale();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Index → first section
  if (pathname === '/settings' || pathname === '/settings/') {
    return <Navigate to={paths.settings.appearance.path} replace />;
  }

  return (
    <div className="-mx-8 -my-8 grid min-h-[calc(100svh-0px)] grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="flex flex-col gap-6 border-border/50 border-r bg-foreground/[0.015] px-4 pt-8 pb-6">
        <div className="px-2.5">
          <h1 className="font-semibold text-[15px] tracking-tight">{t('settings:title')}</h1>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('settings:subtitle')}</p>
        </div>

        <div className="flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <SidebarGroupComponent key={group.labelKey} group={group} />
          ))}
        </div>
      </aside>

      {/* Page content */}
      <main className="overflow-auto">
        <div className="w-full px-10 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
