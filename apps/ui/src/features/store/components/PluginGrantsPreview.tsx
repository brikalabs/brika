/**
 * PluginGrantsPreview
 *
 * Read-only preview of the permission families a plugin will request once
 * installed. Shown on the store detail page before installation so operators
 * can evaluate the trust surface before committing.
 *
 * Mirrors the structure of PluginPermissions (the post-install consent UI) but
 * has no toggles — this is informational only. Rendering helpers are shared via
 * grant-rendering.tsx.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@brika/clay';
import { filterValidPermissions, PERMISSIONS } from '@brika/permissions';
import { CheckCircle2, Info, Shield } from 'lucide-react';
import {
  FallbackPermissionIcon,
  PERMISSION_ICON_MAP,
  ScopeDetail,
} from '@/features/plugins/components/grant-rendering';
import { useLocale } from '@/lib/use-locale';
import type { StorePlugin } from '../types';

interface PluginGrantsPreviewProps {
  plugin: StorePlugin;
}

export function PluginGrantsPreview({ plugin }: Readonly<PluginGrantsPreviewProps>) {
  const { t } = useLocale();

  // Derive the permission families from the grants record keys, then filter to
  // only known families. Same derivation the runtime uses.
  const grants = plugin.grants ?? {};
  const grantFamilies = Object.keys(grants).map((id) => id.split('.')[2] ?? '');
  const uniqueFamilies = [...new Set(grantFamilies)];
  const declaredPermissions = filterValidPermissions(uniqueFamilies);

  const hostsLabel = t('permissions:scope.hosts');
  const pathsLabel = t('permissions:scope.paths');
  const filtersLabel = t('permissions:scope.fileFilters');
  const readLabel = t('permissions:scope.read');
  const readwriteLabel = t('permissions:scope.readwrite');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          {t('permissions:title')}
        </CardTitle>
        <CardDescription>{t('permissions:description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Disclaimer banner */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Installing this plugin will request these permissions. You can approve each one after
            install.
          </p>
        </div>

        {declaredPermissions.length === 0 ? (
          /* Empty state — explicitly reassure the operator */
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <CheckCircle2 className="size-4 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">
              This plugin doesn&apos;t request any permissions.
            </p>
          </div>
        ) : (
          declaredPermissions.map((permission) => {
            const def = PERMISSIONS[permission];
            const Icon = PERMISSION_ICON_MAP[def.icon] ?? FallbackPermissionIcon;

            return (
              <div key={permission} className="rounded-lg bg-muted/30 p-3">
                {/* Info row — no toggle */}
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t(def.labelKey)}</p>
                    <p className="text-muted-foreground text-xs">{t(def.descriptionKey)}</p>
                  </div>
                </div>

                {/* Scope detail — only rendered when there is actionable info */}
                <div className="ml-11">
                  <ScopeDetail
                    family={permission}
                    grants={grants}
                    hostsLabel={hostsLabel}
                    pathsLabel={pathsLabel}
                    filtersLabel={filtersLabel}
                    readLabel={readLabel}
                    readwriteLabel={readwriteLabel}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
