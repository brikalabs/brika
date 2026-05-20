/**
 * PluginPermissions Component
 *
 * Displays plugin-declared permissions with toggles to grant/revoke each one.
 * Only renders when the plugin declares at least one permission.
 *
 * Reads two slices of the plugin manifest:
 *   - `plugin.permissions` (legacy string[]) drives the family-level toggle.
 *     The hub StateStore still keys grants by family, so this is what
 *     `useTogglePermission` writes against.
 *   - `plugin.capabilities` (new Record<id, scope>) is rendered as nested
 *     detail rows under each family so the user can see exactly which
 *     hosts / paths / binaries the plugin asks for. Read-only for now —
 *     per-id grants land when the StateStore migrates.
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

/**
 * Extract the permission family from a reverse-DNS capability id.
 * `dev.brika.net.fetch` -> `net`, `dev.brika.fs.read` -> `fs`.
 * Third-party capabilities (`com.acme.weather.scrape`) follow the same
 * `<vendor>.<product>.<family>.<verb>` shape, so the third segment is
 * always the family.
 */
function familyFromCapabilityId(id: string): string | null {
  const parts = id.split('.');
  return parts.length >= 4 ? (parts[2] ?? null) : null;
}

/** Render the scope value as a one-line summary for the row. */
function summarizeScope(scope: unknown): string | null {
  if (!scope || typeof scope !== 'object') {
    return null;
  }
  const record = scope as Record<string, unknown>;
  if (Array.isArray(record.allow) && record.allow.length > 0) {
    return record.allow.join(', ');
  }
  if (Array.isArray(record.allowBinaries) && record.allowBinaries.length > 0) {
    return record.allowBinaries.join(', ');
  }
  return null;
}

export function PluginPermissions({ plugin }: Readonly<PluginPermissionsProps>) {
  const { t } = useLocale();
  const toggleMutation = useTogglePermission(plugin.uid);

  // Only show recognized permissions from the typed registry
  const declaredPermissions = plugin.permissions.filter(isValidPermission);

  if (declaredPermissions.length === 0) {
    return null;
  }

  // Index capabilities by family so each permission row can list its
  // declared capability ids + scope details.
  const capsByFamily = new Map<string, Array<{ id: string; scope: unknown }>>();
  for (const [id, scope] of Object.entries(plugin.capabilities ?? {})) {
    const family = familyFromCapabilityId(id);
    if (family === null) {
      continue;
    }
    const list = capsByFamily.get(family) ?? [];
    list.push({ id, scope });
    capsByFamily.set(family, list);
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
          const caps = capsByFamily.get(permission) ?? [];

          return (
            <div
              key={permission}
              className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between">
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
              {caps.length > 0 && (
                <ul className="ml-11 flex flex-col gap-1 text-muted-foreground text-xs">
                  {caps.map(({ id, scope }) => {
                    const summary = summarizeScope(scope);
                    return (
                      <li key={id} className="flex items-baseline gap-2">
                        <code className="font-mono text-[11px]">{id}</code>
                        {summary && <span className="opacity-75">— {summary}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
