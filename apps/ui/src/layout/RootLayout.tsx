import { Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import {
  Calendar,
  FileText,
  GitBranch,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Plug,
  Settings,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav:dashboard', icon: LayoutDashboard },
  { to: '/plugins', labelKey: 'nav:plugins', icon: Plug },
  { to: '/tools', labelKey: 'nav:tools', icon: Wrench },
  { to: '/events', labelKey: 'nav:events', icon: Zap },
  { to: '/workflows', labelKey: 'nav:workflows', icon: Workflow },
  { to: '/schedules', labelKey: 'nav:schedules', icon: Calendar },
  { to: '/rules', labelKey: 'nav:rules', icon: GitBranch },
  { to: '/logs', labelKey: 'nav:logs', icon: FileText },
  { to: '/store', labelKey: 'nav:store', icon: Package },
  { to: '/settings', labelKey: 'nav:settings', icon: Settings },
];

function NavLink({ to, labelKey, icon: Icon }: NavItem) {
  const match = useMatchRoute();
  const { t } = useLocale();
  const isActive = to === '/' ? match({ to: '/' }) : match({ to, fuzzy: true });

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-4" />
      {t(labelKey)}
    </Link>
  );
}

export function RootLayout() {
  const { t } = useLocale();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="border-b p-6">
          <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text font-bold text-2xl text-transparent tracking-tight">
            ELIA
          </h1>
          <p className="mt-0.5 text-muted-foreground text-xs">{t('dashboard:subtitle')}</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="border-t p-4 text-muted-foreground text-xs">v0.1.0 · Bun Runtime</div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
