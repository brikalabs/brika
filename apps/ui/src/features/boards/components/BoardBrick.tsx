import type { ComponentNode } from '@brika/ui-kit';
import { Bug, Ellipsis, Loader2, WifiOff } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Component, type ErrorInfo, memo, type ReactNode, useCallback } from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useBrickInstanceAction } from '../hooks';
import {
  useBrickPlacement,
  useBoardStore,
  useInstanceBody,
  useIsInstanceDisconnected,
} from '../store';
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

interface BoardBrickProps {
  instanceId: string;
  brickTypeId: string;
}

export const BoardBrick = memo(function BoardBrick({
  instanceId,
  brickTypeId,
}: BoardBrickProps) {
  const { t, tp } = useLocale();
  const brickType = useBoardStore((s) => s.brickTypes.get(brickTypeId));
  const placement = useBrickPlacement(instanceId);
  const body = useInstanceBody(instanceId);
  const disconnected = useIsInstanceDisconnected(instanceId);
  const { mutate: sendAction } = useBrickInstanceAction();
  const setConfigBrickId = useBoardStore((s) => s.setConfigBrickId);

  const iconName = (brickType?.icon || 'layout-dashboard') as IconName;
  const color = brickType?.color ?? 'var(--color-primary)';
  const brickTypeName = brickType
    ? tp(
        brickType.pluginName,
        `bricks.${brickType.localId}.name`,
        brickType.name ?? brickType.localId
      )
    : brickTypeId;
  const displayName = placement?.label || brickTypeName;

  const handleAction = useCallback(
    (actionId: string, payload?: Record<string, unknown>) => {
      sendAction({ instanceId, actionId, payload });
    },
    [instanceId, sendAction]
  );

  return (
    <div className="group/brick relative flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/50 transition-shadow hover:shadow-md">
      {/* Header — drag handle + single action button */}
      <div className="drag-handle flex shrink-0 cursor-grab items-center gap-1.5 px-2.5 pt-2 pb-0 active:cursor-grabbing">
        <DynamicIcon name={iconName} className="size-3.5 shrink-0" style={{ color }} />
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground/80 text-xs">
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="no-drag size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/brick:opacity-100"
          onClick={() => setConfigBrickId(instanceId)}
        >
          <Ellipsis className="size-3.5" />
        </Button>
      </div>

      {/* Body — fills remaining space, no scroll */}
      <div className="no-drag flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2.5 pt-1.5 pb-2.5 *:min-h-0 *:flex-1">
        <BrickErrorBoundary>
          {body && body.length > 0 &&
            body
              .filter(Boolean)
              .map((node, i) => (
                <ComponentNodeRenderer key={nodeKey(node, i)} node={node} onAction={handleAction} />
              ))}
          {(!body || body.length === 0) && disconnected && (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
              <WifiOff className="size-4 text-muted-foreground/50" />
              <span className="text-muted-foreground/70 text-xs">
                {t('boards:pluginDisconnected')}
              </span>
            </div>
          )}
          {(!body || body.length === 0) && !disconnected && (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
            </div>
          )}
        </BrickErrorBoundary>
      </div>
    </div>
  );
});
