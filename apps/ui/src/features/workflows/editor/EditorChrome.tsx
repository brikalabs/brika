import type { Node } from '@xyflow/react';
import { Blocks, GripVertical, MousePointerClick, Settings2, Zap } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { Workflow } from '../api';
import type { BlockDefinition } from './BlockToolbar';
import { BlockToolbar } from './BlockToolbar';
import { CollapsedTab, CollapsedTabsContainer, CollapsiblePanel } from './CollapsiblePanel';
import { ConfigPanel } from './ConfigPanel';
import { DebugPanel } from './DebugPanel';
import type { PanelName } from './use-panel-state';

interface BlocksPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function BlocksPanel({ isOpen, onToggle }: Readonly<BlocksPanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="left"
      icon={<Blocks className="size-4" />}
      title={t('workflows:editor.panels.blocks')}
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-56"
    >
      <BlockToolbar className="h-full w-full" onCollapse={onToggle} />
    </CollapsiblePanel>
  );
}

interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  workflow: Workflow;
  selectedNode: Node | null;
  updateBlockConfig: (nodeId: string, config: Record<string, unknown>) => void;
  availableVariables: Array<{
    name: string;
    source: string;
    type: string;
    preview?: string;
  }>;
  blockSchema: BlockDefinition['schema'] | undefined;
  viewModuleUrl: string | undefined;
  pluginUid: string | undefined;
}

/**
 * The single right-hand panel. Focused, never stacked: a selected block shows
 * its configuration; an empty selection shows the workflow's runs/live
 * observability. Click the canvas to get back to the workflow view.
 */
export function InspectorPanel({
  isOpen,
  onToggle,
  workflow,
  selectedNode,
  updateBlockConfig,
  availableVariables,
  blockSchema,
  viewModuleUrl,
  pluginUid,
}: Readonly<InspectorPanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="right"
      icon={
        selectedNode ? <Settings2 className="size-4" /> : <Zap className="size-4 text-yellow-500" />
      }
      title={
        selectedNode ? t('workflows:editor.panels.config') : t('workflows:editor.panels.debug')
      }
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-88"
    >
      {selectedNode ? (
        <ConfigPanel
          node={selectedNode}
          onUpdateBlock={updateBlockConfig}
          availableVariables={availableVariables}
          blockSchema={blockSchema}
          viewModuleUrl={viewModuleUrl}
          pluginUid={pluginUid}
          className="h-full w-full"
          onCollapse={onToggle}
        />
      ) : (
        <DebugPanel workflow={workflow} className="h-full w-full" onCollapse={onToggle} />
      )}
    </CollapsiblePanel>
  );
}

interface LeftCollapsedTabsProps {
  togglePanel: (panel: PanelName) => void;
}

export function LeftCollapsedTabs({ togglePanel }: Readonly<LeftCollapsedTabsProps>) {
  const { t } = useLocale();

  return (
    <CollapsedTabsContainer side="left">
      <CollapsedTab
        side="left"
        icon={<Blocks className="size-4" />}
        title={t('workflows:editor.panels.blocks')}
        onExpand={() => togglePanel('blocks')}
      />
    </CollapsedTabsContainer>
  );
}

interface RightCollapsedTabsProps {
  hasSelection: boolean;
  togglePanel: (panel: PanelName) => void;
}

export function RightCollapsedTabs({
  hasSelection,
  togglePanel,
}: Readonly<RightCollapsedTabsProps>) {
  const { t } = useLocale();

  return (
    <CollapsedTabsContainer side="right">
      <CollapsedTab
        side="right"
        icon={
          hasSelection ? (
            <Settings2 className="size-4" />
          ) : (
            <Zap className="size-4 text-yellow-500" />
          )
        }
        title={
          hasSelection ? t('workflows:editor.panels.config') : t('workflows:editor.panels.debug')
        }
        onExpand={() => togglePanel('inspector')}
      />
    </CollapsedTabsContainer>
  );
}

export function EmptyStateOverlay() {
  const { t } = useLocale();

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-muted-foreground/30 border-dashed bg-background/80 p-8 text-center backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <GripVertical className="size-6 text-primary" />
          </div>
          <MousePointerClick className="size-5 text-muted-foreground" />
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
            <Blocks className="size-6 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="font-medium">{t('workflows:editor.panels.dragToAdd')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('workflows:editor.panels.blocksDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
