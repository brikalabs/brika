import { Link, Outlet, useMatchRoute, useRouterState } from '@tanstack/react-router';
import {
  Blocks,
  FileText,
  LayoutDashboard,
  LayoutGrid,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
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

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav:groups.core',
    items: [
      { to: '/', labelKey: 'nav:dashboard', icon: LayoutDashboard },
      { to: '/plugins', labelKey: 'nav:plugins', icon: Plug },
      { to: '/workflows', labelKey: 'nav:workflows', icon: Workflow },
    ],
  },
  {
    labelKey: 'nav:groups.tools',
    items: [
      { to: '/sparks', labelKey: 'nav:sparks', icon: Zap },
      { to: '/blocks', labelKey: 'nav:blocks', icon: Blocks },
      { to: '/boards', labelKey: 'nav:boards', icon: LayoutGrid },
      { to: '/logs', labelKey: 'nav:logs', icon: FileText },
    ],
  },
  {
    labelKey: 'nav:groups.system',
    items: [
      { to: '/store', labelKey: 'nav:store', icon: Package },
      { to: '/settings', labelKey: 'nav:settings', icon: Settings },
    ],
  },
];

function NavLink({ to, labelKey, icon: Icon }: Readonly<NavItem>) {
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

function NavGroupComponent({ group }: Readonly<{ group: NavGroup }>) {
  const { t } = useLocale();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AppSidebarHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" onClick={toggleSidebar} tooltip="BRIKA">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <span className="font-bold text-sm">B</span>
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">BRIKA</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

function AppSidebarFooter() {
  const { t } = useLocale();
  const { data: health } = useHealth();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={t('nav:settings')}>
            <Link to="/settings">
              <Settings />
              <span>{t('nav:settings')}</span>
              {health && (
                <span className="ml-auto text-[10px] text-muted-foreground">v{health.version}</span>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

function AppSidebar() {
  // Filter out settings from nav groups since it's now in footer
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.to !== '/settings'),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader />
      <SidebarContent>
        {filteredGroups.map((group) => (
          <NavGroupComponent key={group.labelKey} group={group} />
        ))}
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
    const pattern = route.replaceAll(/\$\w+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(currentPath);
  });

  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <main className={cn('min-w-0 flex-1 overflow-auto', !isFullBleed && 'p-8')}>
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}
