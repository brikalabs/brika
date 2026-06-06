/**
 * Client-side brick renderer.
 *
 * Dynamically imports a browser-compiled brick module (ESM) served by the hub.
 * CSS is inlined into the JS module as a self-injecting <style> tag.
 * Wraps the loaded component in BrickViewContext and sets the active plugin UID.
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { PluginContext } from '@/features/plugins/components/plugin-context';
import { useModuleImport } from '@/features/plugins/components/use-module-import';
import type { BrickType } from '../api';
import { hydrateBrickData } from '../hooks';
import { useBoardStore, useBrickPlacement } from '../store';
import { BrickViewContext, type BrickViewContextValue } from './BrickViewContext';

/**
 * How long a loaded brick may have no data before we surface a diagnostic.
 * This is a safety net only: it does not change rendering (the plugin owns
 * its own empty/loading UI), but it guarantees an infinite-spinner brick is
 * never silent, so a missed snapshot/push is debuggable from the host.
 */
const STUCK_BRICK_WARN_MS = 15_000;

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

  const hasData = useBoardStore((s) => s.brickData.has(brickTypeId));

  // Per-brick instant hydration: when this brick mounts (board switch, or a
  // brick added without a page reload) and the store has no data for it yet,
  // pull the current snapshot once. hydrateBrickData dedupes per board via a
  // shared in-flight promise, so adding/mounting N bricks fires one request,
  // not N. If data is already present we skip the fetch entirely (SWR: the
  // existing value keeps rendering and we never flash a bare spinner).
  useEffect(() => {
    if (hasData) {
      return;
    }
    const boardId = useBoardStore.getState().activeBoardId;
    if (!boardId) {
      return;
    }
    console.info(
      `[boards] brick "${brickTypeId}" (instance ${instanceId}) mounted without data; requesting snapshot`
    );
    hydrateBrickData(boardId, `brick ${brickTypeId} mount`);
  }, [hasData, brickTypeId, instanceId]);

  // Safety net: if the module has mounted but no brick data has arrived after
  // a grace period, log it. The deterministic delivery paths (REST snapshot on
  // mount + SSE snapshot/live updates) should make this rare; when it fires it
  // points at a plugin that has never pushed, not a missed delivery.
  useEffect(() => {
    if (!Module || hasData) {
      return;
    }
    const timer = setTimeout(() => {
      console.warn(
        `[boards] brick "${brickTypeId}" (instance ${instanceId}) has no data ${STUCK_BRICK_WARN_MS}ms after load; the plugin may not have pushed yet`
      );
    }, STUCK_BRICK_WARN_MS);
    return () => clearTimeout(timer);
  }, [Module, hasData, brickTypeId, instanceId]);

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
