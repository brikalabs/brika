import { Scope } from '@brika/auth';
import { useAuth, useCanAccess } from '@brika/auth/react';
import { Link, Navigate, Outlet, useMatchRoute, useRouterState } from '@tanstack/react-router';
import {
  Blocks,
  ChevronsUpDown,
  CircleUserRound,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Package,
  Plug,
  Settings,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { BrikaLogo } from '@/components/ui/brika-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { UserAvatar } from '@/components/user-avatar';
import { LoginPage } from '@/features/auth';
import { useHealth } from '@/features/dashboard/hooks';
import { useUpdateCheck } from '@/features/updates';
import { useAuthInterceptor } from '@/hooks/use-auth-interceptor';
import { ThemeProvider } from '@/lib/theme-provider';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  suffix?: React.ReactNode;
  adminOnly?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav:groups.overview',
    items: [
      {
        to: '/',
        labelKey: 'nav:dashboard',
        icon: LayoutDashboard,
      },
      {
        to: '/boards',
        labelKey: 'nav:boards',
        icon: LayoutGrid,
      },
      {
        to: '/workflows',
        labelKey: 'nav:workflows',
        icon: Workflow,
      },
    ],
  },
  {
    labelKey: 'nav:groups.registry',
    items: [
      {
        to: '/plugins',
        labelKey: 'nav:plugins',
        icon: Plug,
      },
      {
        to: '/sparks',
        labelKey: 'nav:sparks',
        icon: Zap,
      },
      {
        to: '/blocks',
        labelKey: 'nav:blocks',
        icon: Blocks,
      },
    ],
  },
  {
    labelKey: 'nav:groups.system',
    items: [
      {
        to: '/store',
        labelKey: 'nav:store',
        icon: Package,
      },
      {
        to: '/logs',
        labelKey: 'nav:logs',
        icon: FileText,
      },
      {
        to: '/admin/users',
        labelKey: 'nav:users',
        icon: Users,
        adminOnly: true,
      },
      {
        to: '/settings',
        labelKey: 'nav:settings',
        icon: Settings,
      },
    ],
  },
];

function NavLink({ to, labelKey, icon: Icon, suffix }: Readonly<NavItem>) {
  const match = useMatchRoute();
  const { t } = useLocale();
  const isActive =
    to === '/'
      ? match({
          to: '/',
        })
      : match({
          to,
          fuzzy: true,
        });
  const label = t(labelKey);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!isActive} tooltip={label}>
        <Link to={to}>
          <Icon />
          <span>{label}</span>
          {suffix}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavGroupComponent({
  group,
}: Readonly<{
  group: NavGroup;
}>) {
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
            <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <BrikaLogo className="size-5 text-white" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">BRIKA</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

function UserInfo({
  user,
}: Readonly<{
  user: {
    name: string;
    email: string;
  };
}>) {
  return (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-semibold">{user.name}</span>
      <span className="truncate text-muted-foreground text-xs">{user.email}</span>
    </div>
  );
}

function UserMenu() {
  const { user, clearSession, client } = useAuth();
  const { t } = useLocale();
  const { isMobile } = useSidebar();

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await client.logout();
    clearSession();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={user.name}>
              <UserAvatar user={user} size="lg" />
              <UserInfo user={user} />
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
              <UserAvatar user={user} size="sm" />
              <UserInfo user={user} />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <CircleUserRound />
                {t('auth:profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              {t('auth:logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar() {
  const { data: health } = useHealth();
  const { data: updateInfo } = useUpdateCheck();
  const hasUpdate = updateInfo?.updateAvailable;
  const isAdmin = useCanAccess(Scope.ADMIN_ALL);

  const versionSuffix = health ? (
    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
      {hasUpdate && <span className="size-1.5 rounded-full bg-primary" />}v{health.version}
    </span>
  ) : undefined;

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !item.adminOnly || isAdmin)
      .map((item) =>
        item.to === '/settings'
          ? {
              ...item,
              suffix: versionSuffix,
            }
          : item
      ),
  }));

  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader />
      <SidebarContent>
        {groups.map((group) => (
          <NavGroupComponent key={group.labelKey} group={group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// Routes that should have no padding (full-bleed layout)
const FULL_BLEED_ROUTES = ['/workflows/new', '/workflows/$id/edit'];

export function RootLayout() {
  const { isAuthenticated, isLoading, needsSetup } = useAuth();
  const routerState = useRouterState();
  useAuthInterceptor();

  const currentPath = routerState.location.pathname;
  const isSetupRoute = currentPath.startsWith('/setup');

  // Auth gate: loading → spinner, setup → setup routes, not authenticated → login page
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Setup routes: let the setup layout handle its own chrome
  if (isSetupRoute) {
    if (!needsSetup) {
      return <Navigate to="/" />;
    }
    return <Outlet />;
  }

  // Redirect to setup if needed
  if (needsSetup) {
    return <Navigate to="/setup/welcome" />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Check if current route should be full-bleed
  const isFullBleed = FULL_BLEED_ROUTES.some((route) => {
    // Convert route pattern to regex (handle $param patterns)
    const pattern = route.replaceAll(/\$\w+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(currentPath);
  });

  return (
    <ThemeProvider>
      <SidebarProvider className="h-svh max-h-svh">
        <AppSidebar />
        <SidebarInset className="min-w-0 overflow-hidden">
          <main className={cn('min-w-0 flex-1', isFullBleed ? 'overflow-hidden' : 'overflow-auto p-8')}>
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}
