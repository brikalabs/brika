import type { ComponentNode } from '@brika/ui-kit';
import { Bug, Loader2, Settings, Trash2 } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Component, type ErrorInfo, memo, type ReactNode, useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useBrickInstanceAction, useRemoveBrick } from '../hooks';
import { useDashboardStore, useInstanceBody } from '../store';
import { ComponentNodeRenderer } from './renderers';

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface BrickErrorBoundaryState {
  error: Error | null;
}

class BrickErrorBoundary extends Component<{ children: ReactNode }, BrickErrorBoundaryState> {
  state: BrickErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BrickErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 text-center">
          <Bug className="size-6 text-muted-foreground" />
          <span className="font-medium text-muted-foreground text-xs">Oops, this brick broke!</span>
          <span className="line-clamp-2 text-[10px] text-muted-foreground/70">
            {this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Derive a stable React key from a component node to prevent unnecessary remounts. */
function nodeKey(node: ComponentNode, index: number): string {
  switch (node.type) {
    case 'video':
      return `video-${node.src}`;
    case 'image':
      return `image-${node.src}`;
    case 'chart':
      return `chart-${index}`;
    case 'section':
      return `section-${node.title}`;
    default:
      return `${node.type}-${index}`;
  }
}

interface DashboardBrickProps {
  instanceId: string;
  brickTypeId: string;
}

export const DashboardBrick = memo(function DashboardBrick({
  instanceId,
  brickTypeId,
}: DashboardBrickProps) {
  const { t } = useLocale();
  const brickType = useDashboardStore((s) => s.brickTypes.get(brickTypeId));
  const body = useInstanceBody(instanceId);
  const { mutate: sendAction } = useBrickInstanceAction();
  const { mutate: removeBrick } = useRemoveBrick();
  const setConfigBrickId = useDashboardStore((s) => s.setConfigBrickId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const iconName = (brickType?.icon || 'layout-dashboard') as IconName;
  const color = brickType?.color ?? 'var(--color-primary)';

  const handleAction = useCallback(
    (actionId: string, payload?: Record<string, unknown>) => {
      sendAction({ instanceId, actionId, payload });
    },
    [instanceId, sendAction]
  );

  return (
    <>
      <div className="group/brick relative flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/50 transition-shadow hover:shadow-md">
        {/* Drag handle — full header area */}
        <div className="drag-handle flex shrink-0 cursor-grab items-center gap-1.5 px-2.5 pt-2 pb-0 active:cursor-grabbing">
          <DynamicIcon name={iconName} className="size-3.5 shrink-0" style={{ color }} />
          <span className="min-w-0 flex-1 truncate font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            {brickType?.name ?? brickTypeId}
          </span>
        </div>

        {/* Hover controls — top right overlay */}
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/brick:opacity-100">
          {Array.isArray(brickType?.config) && brickType.config.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-6 rounded-full"
                  onClick={() => setConfigBrickId(instanceId)}
                >
                  <Settings className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('common:labels.settings')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-6 rounded-full text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('common:actions.delete')}</TooltipContent>
          </Tooltip>
        </div>

        {/* Body — fills remaining space, no scroll */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2.5 pt-1.5 pb-2.5">
          <BrickErrorBoundary>
            {body && body.length > 0 ? (
              body
                .filter(Boolean)
                .map((node, i) => (
                  <ComponentNodeRenderer
                    key={nodeKey(node, i)}
                    node={node}
                    onAction={handleAction}
                  />
                ))
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
              </div>
            )}
          </BrickErrorBoundary>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common:messages.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{brickType?.name ?? brickTypeId}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeBrick(instanceId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
