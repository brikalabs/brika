/**
 * PluginCapabilities — per-capability granular consent UI.
 *
 * Replaces the legacy `PluginPermissions` family-level toggle. Each row shows
 * one capability the plugin manifest requests:
 *   - icon, title, description
 *   - an editor for the granted scope (driven by the spec's `ui` hint)
 *   - Save / Revoke actions
 *
 * The user can narrow the scope (e.g. trim `allow: ['*']` to
 * `['api.spotify.com']`) and Save. Revoke removes the grant entirely.
 */

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@brika/clay';
import {
  Box,
  Folder,
  Globe,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  MapPin,
  Play,
  Route as RouteIcon,
  Settings,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { PluginCapability } from '../api';
import { usePluginCapabilities, useRevokeCapability, useSetCapabilityScope } from '../hooks';
import { ScopeEditor } from './ScopeEditor';

const ICON_MAP: Record<string, LucideIcon> = {
  globe: Globe,
  'key-round': KeyRound,
  folder: Folder,
  terminal: Terminal,
  'map-pin': MapPin,
  zap: Zap,
  box: Box,
  'layout-grid': LayoutGrid,
  route: RouteIcon,
  play: Play,
  settings: Settings,
};

interface PluginCapabilitiesProps {
  pluginUid: string;
}

export function PluginCapabilities({ pluginUid }: Readonly<PluginCapabilitiesProps>) {
  const { t } = useLocale();
  const { data, isLoading } = usePluginCapabilities(pluginUid);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            {t('plugins:capabilities.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const capabilities = data?.capabilities ?? [];
  if (capabilities.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          {t('plugins:capabilities.title')}
        </CardTitle>
        <CardDescription>{t('plugins:capabilities.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {capabilities.map((cap) => (
          <CapabilityRow key={cap.id} pluginUid={pluginUid} capability={cap} />
        ))}
      </CardContent>
    </Card>
  );
}

interface CapabilityRowProps {
  pluginUid: string;
  capability: PluginCapability;
}

function CapabilityRow({ pluginUid, capability }: Readonly<CapabilityRowProps>) {
  const { t } = useLocale();
  const isGranted = capability.grantedScope !== null;
  // Local editor state — initialised from the granted scope when present,
  // otherwise from the manifest-requested scope (the "default proposal").
  const [draft, setDraft] = useState<unknown>(capability.grantedScope ?? capability.requestedScope);
  const setScope = useSetCapabilityScope(pluginUid);
  const revoke = useRevokeCapability(pluginUid);

  // Re-sync the draft when the upstream grant changes (e.g. after a save
  // from another tab / device).
  useEffect(() => {
    setDraft(capability.grantedScope ?? capability.requestedScope);
  }, [capability.grantedScope, capability.requestedScope]);

  const Icon = capability.icon ? (ICON_MAP[capability.icon] ?? Shield) : Shield;
  const isPending = setScope.isPending || revoke.isPending;

  const handleSave = () => {
    setScope.mutate({ capId: capability.id, scope: draft });
  };

  const handleRevoke = () => {
    revoke.mutate(capability.id);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="font-medium text-sm">{capability.title}</p>
          {capability.description && (
            <p className="text-muted-foreground text-xs">{capability.description}</p>
          )}
          <code className="font-mono text-[11px] text-muted-foreground opacity-60">
            {capability.id}
          </code>
        </div>
      </div>
      <div className="ml-11">
        <ScopeEditor hint={capability.ui} scope={draft} onChange={setDraft} disabled={isPending} />
      </div>
      <div className="ml-11 flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isGranted ? t('common:actions.save') : t('plugins:capabilities.grant')}
        </Button>
        {isGranted && (
          <Button size="sm" variant="outline" onClick={handleRevoke} disabled={isPending}>
            {t('plugins:capabilities.revoke')}
          </Button>
        )}
      </div>
    </div>
  );
}
