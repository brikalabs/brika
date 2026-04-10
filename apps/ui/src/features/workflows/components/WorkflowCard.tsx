import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, Bug, MoreVertical, Play, Square, Trash2, Workflow } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';
import type { BlockDefinition, Workflow as WorkflowType } from '../api';

interface WorkflowCardProps {
  workflow: WorkflowType;
  blockTypes: Map<string, BlockDefinition>;
  onToggle: (options: { id: string; enabled: boolean }) => void;
  onDelete: (id: string) => void;
  onDebug: (workflow: WorkflowType) => void;
}

const STATUS_STYLES = {
  running: {
    icon: Play,
    iconClass: 'fill-current',
    badge: 'border-success/20 bg-success/10 text-success',
    card: 'border-success/20',
    avatar: 'bg-success/10 text-success',
  },
  error: {
    icon: AlertCircle,
    iconClass: '',
    badge: '',
    card: 'border-destructive/20',
    avatar: 'bg-destructive/10 text-destructive',
  },
  stopped: {
    icon: Square,
    iconClass: 'fill-current',
    badge: '',
    card: '',
    avatar: 'bg-primary/10 text-primary',
  },
} as const;

function getStatusConfig(status?: string) {
  if (status === 'running' || status === 'error') {
    return STATUS_STYLES[status];
  }
  return STATUS_STYLES.stopped;
}

function stopNav(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

export function WorkflowCard({
  workflow,
  blockTypes,
  onToggle,
  onDelete,
  onDebug,
}: Readonly<WorkflowCardProps>) {
  const { t, formatTime } = useLocale();
  const navigate = useNavigate();

  const status = getStatusConfig(workflow.status);
  const isError = workflow.status === 'error';
  const isRunning = workflow.status === 'running';
  const blockCount = workflow.blocks?.length ?? 0;

  return (
    <Card
      interactive
      className={cn('p-4', status.card)}
      onClick={() => navigate({ to: paths.workflows.edit.to({ id: workflow.id }) })}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            status.avatar
          )}
        >
          <Workflow className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{workflow.name || workflow.id}</span>
            {blockCount > 0 && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {blockCount} {t('common:items.block', { count: blockCount }).toLowerCase()}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-muted-foreground text-xs">{workflow.id}</p>
        </div>

        {isError ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="shrink-0 cursor-help gap-1.5 text-[11px]">
                <AlertCircle className="size-3" />
                {t('common:status.error')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{workflow.error || 'Unknown error'}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Badge
            variant={isRunning ? 'default' : 'secondary'}
            className={cn('shrink-0 gap-1.5 text-[11px]', status.badge)}
          >
            <status.icon className={cn('size-3', status.iconClass)} />
            {t(`common:status.${workflow.status ?? 'stopped'}`)}
          </Badge>
        )}

        <div className="flex items-center gap-1" onClick={stopNav} onKeyDown={stopNav} role="group">
          <Switch
            checked={workflow.enabled}
            disabled={isError}
            onCheckedChange={(checked) => onToggle({ id: workflow.id, enabled: checked })}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!isRunning} onClick={() => onDebug(workflow)}>
                <Bug className="size-4" />
                {t('workflows:actions.debug')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(workflow.id)}
              >
                <Trash2 className="size-4" />
                {t('common:actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {blockCount > 0 && (
        <div className="mt-2.5 flex items-center justify-between pl-13">
          <div className="flex items-center gap-1">
            {[...new Set(workflow.blocks?.map((b) => b.type))].map((type) => {
              const def = blockTypes.get(type);
              const color = def?.color ?? '#6b7280';
              return (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex size-6 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      <DynamicIcon name={(def?.icon ?? 'box') as IconName} className="size-3" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{def?.name ?? type}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {isRunning && workflow.startedAt && (
            <span className="text-[11px] text-muted-foreground">
              {formatTime(workflow.startedAt)}
            </span>
          )}
        </div>
      )}

      {isError && workflow.error && (
        <div className="mt-2 flex items-start gap-1.5 pl-13">
          <AlertCircle className="mt-px size-3 shrink-0 text-destructive" />
          <span className="line-clamp-1 text-[11px] text-destructive leading-relaxed">
            {workflow.error}
          </span>
        </div>
      )}
    </Card>
  );
}
