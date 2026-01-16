import { Link, Outlet, useMatchRoute, useRouterState } from '@tanstack/react-router';
import {
  Blocks,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Plug,
  Settings,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useHealth } from '@/features/dashboard/hooks';
import { ThemeProvider } from '@/lib/theme-provider';
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
  { to: '/events', labelKey: 'nav:events', icon: Zap },
  { to: '/workflows', labelKey: 'nav:workflows', icon: Workflow },
  { to: '/blocks', labelKey: 'nav:blocks', icon: Blocks },
  { to: '/logs', labelKey: 'nav:logs', icon: FileText },
  { to: '/store', labelKey: 'nav:store', icon: Package },
  { to: '/settings', labelKey: 'nav:settings', icon: Settings },
];

function NavLink({ to, labelKey, icon: Icon }: NavItem) {
  const match = useMatchRoute();
  const { t } = useLocale();
  const isActive = to === '/' ? match({ to: '/' }) : match({ to, fuzzy: true });
  const label = t(labelKey);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!isActive} tooltip={label}>
        <Link to={to}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppSidebarHeader() {
  const { t } = useLocale();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <SidebarHeader className="border-b p-4">
      <div
        className={cn(
          'flex items-center transition-all duration-200',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        <div>
          <h1
            className={cn(
              'bg-gradient-to-r from-primary to-primary/60 bg-clip-text font-bold text-transparent tracking-tight transition-all duration-200',
              isCollapsed ? 'text-lg' : 'text-xl'
            )}
          >
            {isCollapsed ? 'B' : 'BRIKA'}
          </h1>
          {!isCollapsed && (
            <p className="mt-0.5 text-muted-foreground text-xs">{t('dashboard:subtitle')}</p>
          )}
        </div>
        {!isCollapsed && <SidebarTrigger className="-mr-2" />}
      </div>
    </SidebarHeader>
  );
}

function AppSidebarFooter() {
  const { data: health } = useHealth();

  return (
    <SidebarFooter className="border-t p-2 group-data-[collapsible=icon]:hidden">
      <div className="px-2 text-muted-foreground text-xs">
        {health ? `v${health.version} · ${health.runtime}` : '...'}
      </div>
    </SidebarFooter>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <AppSidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}

// Routes that should have no padding (full-bleed layout)
const FULL_BLEED_ROUTES = ['/workflows/new', '/workflows/$id/edit'];

export function RootLayout() {
  const routerState = useRouterState();

  // Check if current route should be full-bleed
  const currentPath = routerState.location.pathname;
  const isFullBleed = FULL_BLEED_ROUTES.some((route) => {
    // Convert route pattern to regex (handle $param patterns)
    const pattern = route.replace(/\$\w+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(currentPath);
  });

  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className={cn('flex-1 overflow-auto', !isFullBleed && 'p-8')}>
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}
