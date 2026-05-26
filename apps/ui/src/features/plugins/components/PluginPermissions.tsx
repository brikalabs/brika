/**
 * PluginPermissions Component
 *
 * Displays plugin-declared permission families with toggles to grant/revoke
 * each one. For families that carry typed scope (net, ws, dns, fs, ui),
 * the specific allow-list or path patterns are shown inline as chips so the
 * operator can evaluate the request without leaving the card.
 *
 * Families with empty scopes (location, secrets) show only the toggle row —
 * there is nothing meaningful to display beneath them.
 *
 * Only renders when the plugin declares at least one recognized permission.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@brika/clay';
import { isValidPermission, PERMISSIONS, type Permission } from '@brika/permissions';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';
import { useTogglePermission } from '../hooks';
import { FallbackPermissionIcon, PERMISSION_ICON_MAP, ScopeDetail } from './grant-rendering';

// ─── Main component ──────────────────────────────────────────────────────────

interface PluginPermissionsProps {
  plugin: Plugin;
}

export function PluginPermissions({ plugin }: Readonly<PluginPermissionsProps>) {
  const { t } = useLocale();
  const toggleMutation = useTogglePermission(plugin.uid);

  // Only show recognized permissions from the typed registry
  const declaredPermissions = plugin.permissions.filter(isValidPermission);

  if (declaredPermissions.length === 0) {
    return null;
  }

  function handleToggle(permission: Permission, granted: boolean) {
    toggleMutation.mutate({ permission, granted });
  }

  const hostsLabel = t('permissions:scope.hosts');
  const pathsLabel = t('permissions:scope.paths');
  const filtersLabel = t('permissions:scope.fileFilters');
  const readLabel = t('permissions:scope.read');
  const readwriteLabel = t('permissions:scope.readwrite');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <FallbackPermissionIcon className="size-5 text-primary" />
          {t('permissions:title')}
        </CardTitle>
        <CardDescription>{t('permissions:description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {declaredPermissions.map((permission) => {
          const def = PERMISSIONS[permission];
          const Icon = PERMISSION_ICON_MAP[def.icon] ?? FallbackPermissionIcon;
          const isGranted = plugin.grantedPermissions.includes(permission);

          return (
            <div key={permission} className="rounded-lg bg-muted/30 p-3">
              {/* Toggle row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t(def.labelKey)}</p>
                    <p className="text-muted-foreground text-xs">{t(def.descriptionKey)}</p>
                  </div>
                </div>
                <Switch
                  checked={isGranted}
                  onCheckedChange={(checked) => handleToggle(permission, checked)}
                  disabled={toggleMutation.isPending}
                />
              </div>

              {/* Scope detail — only rendered when there is actionable info */}
              <div className="ml-11">
                <ScopeDetail
                  family={permission}
                  grants={plugin.grants}
                  hostsLabel={hostsLabel}
                  pathsLabel={pathsLabel}
                  filtersLabel={filtersLabel}
                  readLabel={readLabel}
                  readwriteLabel={readwriteLabel}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
