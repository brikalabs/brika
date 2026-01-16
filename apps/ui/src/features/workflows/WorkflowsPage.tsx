/**
 * Workflows Page
 *
 * Table view of all workflows with status, actions, and navigation to editor.
 */

import { Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, Bug, Pencil, Play, Plus, Search, Square, Trash2 } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Workflow, WorkflowStatus } from './api';
import {
  type DebugEvent,
  DebugEventEntry,
  type DebugFilter,
  EventFilterButtons,
  filterEvents,
  useDebugStream,
} from './debug';
import { useDeleteWorkflow, useDisableWorkflow, useEnableWorkflow, useWorkflows } from './hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status, error }: { status?: WorkflowStatus; error?: string }) {
  const { t } = useLocale();

  if (status === 'running') {
    return (
      <Badge variant="default" className="gap-1.5 border-success/20 bg-success/10 text-success">
        <Play className="size-3 fill-current" />
        {t('common:status.running')}
      </Badge>
    );
  }

  if (status === 'error') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="cursor-help gap-1.5">
            <AlertCircle className="size-3" />
            {t('common:status.error')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{error || 'Unknown error'}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1.5">
      <Square className="size-3 fill-current" />
      {t('common:status.stopped')}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflows Table
// ─────────────────────────────────────────────────────────────────────────────

function WorkflowsTable({
  workflows,
  onToggle,
  onDelete,
  onDebug,
}: {
  workflows: Workflow[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onDebug: (workflow: Workflow) => void;
}) {
  const { t, formatTime } = useLocale();
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">{t('workflows:table.name')}</TableHead>
            <TableHead>{t('workflows:table.status')}</TableHead>
            <TableHead>{t('workflows:table.blocks')}</TableHead>
            <TableHead>{t('workflows:table.startedAt')}</TableHead>
            <TableHead className="w-[180px] text-right">{t('workflows:table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => {
            const blockCount = workflow.blocks?.length || 0;
            const isError = workflow.status === 'error';
            const isRunning = workflow.status === 'running';

            return (
              <TableRow key={workflow.id} className="group">
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Link
                      to="/workflows/$id/edit"
                      params={{ id: workflow.id }}
                      className="font-semibold text-sm leading-tight hover:underline"
                    >
                      {workflow.name || workflow.id}
                    </Link>
                    <span className="font-mono text-muted-foreground text-xs">{workflow.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={workflow.status} error={workflow.error} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {workflow.blocks?.slice(0, 3).map((block) => {
                      const iconName = (block.icon || 'box') as IconName;
                      const color = block.color || '#6b7280';
                      return (
                        <div
                          key={block.id}
                          className="flex size-7 items-center justify-center rounded-lg shadow-sm"
                          style={{ backgroundColor: `${color}15`, color }}
                          title={block.id}
                        >
                          <DynamicIcon name={iconName} className="size-3.5" />
                        </div>
                      );
                    })}
                    {blockCount > 3 && (
                      <span className="font-medium text-muted-foreground text-xs">
                        +{blockCount - 3}
                      </span>
                    )}
                    {blockCount === 0 && (
                      <span className="text-muted-foreground text-xs">
                        {t('workflows:table.noBlocks')}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {workflow.status === 'running' && workflow.startedAt ? (
                    <span className="text-muted-foreground text-xs">
                      {formatTime(workflow.startedAt)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDebug(workflow)}
                      title={t('workflows:actions.debug')}
                      disabled={!isRunning}
                    >
                      <Bug className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        navigate({ to: '/workflows/$id/edit', params: { id: workflow.id } })
                      }
                      title={t('common:actions.edit')}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Switch
                      checked={workflow.enabled}
                      onCheckedChange={(checked) => onToggle(workflow.id, checked)}
                      disabled={isError}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(workflow.id)}
                      title={t('common:actions.delete')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Dialog
// ─────────────────────────────────────────────────────────────────────────────

function DebugDialog({
  workflowId,
  workflowName,
  open,
  onClose,
}: {
  workflowId: string | null;
  workflowName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<DebugFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use shared debug stream hook
  const { events, connected, clear } = useDebugStream({
    workflowId,
    enabled: open && !!workflowId,
    maxEvents: 500,
  });

  // Filter events
  const filteredEvents = filterEvents(events, filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bug className="size-5" />
              {t('workflows:debug.title')}
              {connected ? (
                <Badge variant="default" className="bg-success text-[10px]">
                  {t('workflows:debug.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {t('workflows:debug.disconnected')}
                </Badge>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center justify-between">
            <span>{workflowName || workflowId}</span>
            <EventFilterButtons
              filter={filter}
              onChange={setFilter}
              labels={{
                all: t('workflows:debug.all'),
                logs: t('workflows:debug.logsOnly'),
                emits: t('workflows:debug.emitsOnly'),
              }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/50 p-2">
          <ScrollArea className="h-[400px]" ref={scrollRef}>
            {filteredEvents.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                {t('workflows:debug.waiting')}
              </div>
            ) : (
              <div className="space-y-0">
                {filteredEvents.map((event, i) => (
                  <DebugEventEntry key={`${event.timestamp}-${i}`} event={event} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {filter !== 'all'
                ? `${filteredEvents.length} / ${events.length} ${t('workflows:debug.events')}`
                : `${events.length} ${t('workflows:debug.events')}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clear}>
                {t('workflows:debug.clear')}
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirmation Dialog
// ─────────────────────────────────────────────────────────────────────────────

function DeleteDialog({
  workflowId,
  open,
  onClose,
  onConfirm,
}: {
  workflowId: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workflows:deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('workflows:deleteDialog.description', { id: workflowId })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t('common:actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function WorkflowsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [debugWorkflow, setDebugWorkflow] = useState<Workflow | null>(null);

  const { data: workflows = [], isLoading: loadingWorkflows } = useWorkflows();

  const enableMutation = useEnableWorkflow();
  const disableMutation = useDisableWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const handleToggle = (id: string, enabled: boolean) => {
    if (enabled) {
      enableMutation.mutate(id);
    } else {
      disableMutation.mutate(id);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const handleDebug = (workflow: Workflow) => {
    setDebugWorkflow(workflow);
  };

  // Filter workflows by search
  const filteredWorkflows = workflows.filter(
    (w) =>
      !search ||
      w.id.toLowerCase().includes(search.toLowerCase()) ||
      w.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('workflows:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('workflows:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('workflows:search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          <Button onClick={() => navigate({ to: '/workflows/new' })}>
            <Plus className="mr-2 size-4" />
            {t('workflows:actions.create')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loadingWorkflows ? (
        <div className="py-12 text-center text-muted-foreground">{t('common:loading')}</div>
      ) : filteredWorkflows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="mb-4 text-muted-foreground">
            {search ? t('workflows:noResults') : t('workflows:empty')}
          </p>
          {!search && (
            <Button onClick={() => navigate({ to: '/workflows/new' })}>
              <Plus className="mr-2 size-4" />
              {t('workflows:actions.create')}
            </Button>
          )}
        </Card>
      ) : (
        <WorkflowsTable
          workflows={filteredWorkflows}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onDebug={handleDebug}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteDialog
        workflowId={deleteId}
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />

      {/* Debug Dialog */}
      <DebugDialog
        workflowId={debugWorkflow?.id ?? null}
        workflowName={debugWorkflow?.name}
        open={!!debugWorkflow}
        onClose={() => setDebugWorkflow(null)}
      />
    </div>
  );
}
