/**
 * Client-side brick renderer.
 *
 * Dynamically imports a browser-compiled brick module (ESM) served by the hub.
 * CSS is inlined into the JS module as a self-injecting <style> tag.
 * Wraps the loaded component in BrickViewContext and sets the active plugin UID.
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { PluginContext } from '@/features/plugins/components/plugin-context';
import { useModuleImport } from '@/features/plugins/components/use-module-import';
import type { BrickType } from '../api';
import { useBrickPlacement } from '../store';
import { BrickViewContext, type BrickViewContextValue } from './BrickViewContext';

// ── Component ───────────────────────────────────────────────────────────────

interface ClientBrickViewProps {
  instanceId: string;
  brickTypeId: string;
  brickType: BrickType;
}

export function ClientBrickView({
  instanceId,
  brickTypeId,
  brickType,
}: Readonly<ClientBrickViewProps>) {
  const placement = useBrickPlacement(instanceId);
  const configW = placement?.size?.w ?? 2;
  const configH = placement?.size?.h ?? 2;

  // moduleUrl is pre-built by the hub with the content hash in the filename.
  const { Module, error } = useModuleImport(brickType.moduleUrl ?? '');

  const config = useMemo(
    () => (placement?.config ?? {}) as Record<string, unknown>,
    [placement?.config]
  );

  const size = useMemo(() => ({ w: configW, h: configH }), [configW, configH]);

  const contextValue = useMemo<BrickViewContextValue>(
    () => ({
      instanceId,
      brickTypeId,
      pluginName: brickType.pluginName,
      pluginUid: brickType.pluginUid ?? '',
      config,
      size,
    }),
    [instanceId, brickTypeId, brickType.pluginName, brickType.pluginUid, config, size]
  );

  const pluginContextValue = useMemo(
    () => ({
      uid: brickType.pluginUid ?? '',
      namespace: `plugin:${brickType.pluginName}`,
    }),
    [brickType.pluginUid, brickType.pluginName]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <AlertTriangle className="size-10 text-muted-foreground" />
        <p className="text-muted-foreground">Failed to load brick</p>
      </div>
    );
  }

  if (!Module) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PluginContext.Provider value={pluginContextValue}>
      <BrickViewContext.Provider value={contextValue}>
        <div
          data-brika-scope={`${brickType.pluginName}:bricks/${brickType.localId}`}
          style={{ display: 'contents' }}
        >
          <Module />
        </div>
      </BrickViewContext.Provider>
    </PluginContext.Provider>
  );
}
