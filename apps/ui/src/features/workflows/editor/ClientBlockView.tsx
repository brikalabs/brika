/**
 * Client-side block view renderer.
 *
 * Dynamically imports a browser-compiled block view module (ESM) served by the
 * hub at /api/modules/:uid/:kind/:file, and wraps it in BlockViewContext +
 * PluginContext so the plugin's React owns the surface. The same renderer backs
 * both surfaces: the config-panel view (`blockView`) and the node-body display
 * (`blockNode`).
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { PluginContext } from '@/features/plugins/components/plugin-context';
import { useModuleImport } from '@/features/plugins/components/use-module-import';
import {
  type BlockVariable,
  BlockViewContext,
  type BlockViewContextValue,
} from '../block-view-context';

interface ClientBlockViewProps {
  /** Workflow-local instance id (editor node id). */
  blockId: string;
  /** Fully-qualified block type. */
  blockType: string;
  /** Owning plugin package name. */
  pluginName: string;
  /** Owning plugin process UID. */
  pluginUid: string;
  /** Pre-built module URL (content-hashed) from the hub. */
  moduleUrl: string;
  /** CSS scope id, matching the compiler memKey (`<plugin>:blocks/<id>.<surface>`). */
  scopeId: string;
  /** Current block configuration. */
  config: Record<string, unknown>;
  /** Persist a merged configuration patch. Omitted for read-only surfaces. */
  onUpdateConfig?: (config: Record<string, unknown>) => void;
  /** Typed variables from upstream event types (config autocompletion). */
  variables?: BlockVariable[];
  /** Live runtime data for this block, when available. */
  data?: unknown;
  /** Compact loading/error chrome for the small node-body surface. */
  compact?: boolean;
}

const NO_VARIABLES: BlockVariable[] = [];

export function ClientBlockView({
  blockId,
  blockType,
  pluginName,
  pluginUid,
  moduleUrl,
  scopeId,
  config,
  onUpdateConfig,
  variables,
  data,
  compact,
}: Readonly<ClientBlockViewProps>) {
  const { Module, error } = useModuleImport(moduleUrl);

  const updateConfig = useCallback(
    (patch: Record<string, unknown>) => onUpdateConfig?.({ ...config, ...patch }),
    [config, onUpdateConfig]
  );

  const vars = variables ?? NO_VARIABLES;
  const contextValue = useMemo<BlockViewContextValue>(
    () => ({
      blockId,
      blockType,
      pluginName,
      pluginUid,
      config,
      updateConfig,
      variables: vars,
      data,
    }),
    [blockId, blockType, pluginName, pluginUid, config, updateConfig, vars, data]
  );

  const pluginContextValue = useMemo(
    () => ({ uid: pluginUid, namespace: `plugin:${pluginName}` }),
    [pluginUid, pluginName]
  );

  if (error) {
    return (
      <div
        className={
          compact
            ? 'flex items-center gap-2 px-2 py-1 text-muted-foreground text-xs'
            : 'flex flex-col items-center justify-center gap-3 py-8 text-center'
        }
      >
        <AlertTriangle className={compact ? 'size-3.5' : 'size-8 text-muted-foreground'} />
        <span className="text-muted-foreground text-xs">Failed to load view</span>
      </div>
    );
  }

  if (!Module) {
    return (
      <div
        className={
          compact
            ? 'flex items-center justify-center py-2'
            : 'flex items-center justify-center py-8'
        }
      >
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PluginContext.Provider value={pluginContextValue}>
      <BlockViewContext.Provider value={contextValue}>
        <div data-brika-scope={scopeId}>
          <Module />
        </div>
      </BlockViewContext.Provider>
    </PluginContext.Provider>
  );
}
