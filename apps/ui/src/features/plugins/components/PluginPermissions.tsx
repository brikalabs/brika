/**
 * PluginPermissions Component
 *
 * Displays plugin-declared permissions with toggles to grant/revoke each one.
 * Only renders when the plugin declares at least one permission.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@brika/clay';
import { isValidPermission, PERMISSIONS, type Permission } from '@brika/permissions';
import { type LucideIcon, MapPin, Shield } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';
import { useTogglePermission } from '../hooks';

/** Map permission icon names to Lucide components */
const ICON_MAP: Record<string, LucideIcon> = {
  'map-pin': MapPin,
};

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
    toggleMutation.mutate({
      permission,
      granted,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          {t('plugins:permissions.title')}
        </CardTitle>
        <CardDescription>{t('plugins:permissions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {declaredPermissions.map((permission) => {
          const def = PERMISSIONS[permission];
          const Icon = ICON_MAP[def.icon] ?? Shield;
          const isGranted = plugin.grantedPermissions.includes(permission);

          return (
            <div
              key={permission}
              className="flex items-center justify-between rounded-lg bg-muted/30 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
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
          );
        })}
      </CardContent>
    </Card>
  );
}
