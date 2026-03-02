import { Bug, Ellipsis, PackageX } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Component, type ErrorInfo, memo, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useBoardStore, useBrickPlacement } from '../store';
import { ClientBrickView } from './ClientBrickView';

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface BrickErrorBoundaryState {
  error: Error | null;
}

class BrickErrorBoundary extends Component<
  {
    children: ReactNode;
  },
  BrickErrorBoundaryState
> {
  state: BrickErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return {
      error,
    };
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

interface BoardBrickProps {
  instanceId: string;
  brickTypeId: string;
}

export const BoardBrick = memo(function BoardBrick({ instanceId, brickTypeId }: BoardBrickProps) {
  const { t, tp } = useLocale();
  const brickType = useBoardStore((s) => s.brickTypes.get(brickTypeId));
  const placement = useBrickPlacement(instanceId);
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

  return (
    <div className="group/brick relative flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/50 transition-shadow hover:shadow-md">
      {/* Header — drag handle + single action button */}
      <div className="drag-handle flex shrink-0 cursor-grab items-center gap-1.5 px-2.5 pt-2 pb-0 active:cursor-grabbing">
        <DynamicIcon
          name={iconName}
          className="size-3.5 shrink-0"
          style={{
            color,
          }}
        />
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
      <div className="@container no-drag flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2.5 pt-1.5 pb-2.5 *:min-h-0 *:flex-1">
        <BrickErrorBoundary>
          {brickType ? (
            <ClientBrickView
              instanceId={instanceId}
              brickTypeId={brickTypeId}
              brickType={brickType}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
              <PackageX className="size-4 text-muted-foreground/50" />
              <span className="text-muted-foreground/70 text-xs">
                {t('boards:brickUnavailable')}
              </span>
            </div>
          )}
        </BrickErrorBoundary>
      </div>
    </div>
  );
});
