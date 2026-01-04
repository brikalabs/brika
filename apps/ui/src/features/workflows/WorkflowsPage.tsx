import { ReactFlowProvider } from '@xyflow/react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Pencil,
  Play,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { BlockType, Workflow, WorkflowRun } from './api';
import { saveWorkflow } from './api';
import { WorkflowEditor } from './editor';
import {
  useBlockTypes,
  useDeleteWorkflow,
  useDisableWorkflow,
  useEnableWorkflow,
  useTriggerWorkflow,
  useWorkflow,
  useWorkflowRuns,
  useWorkflows,
} from './hooks';

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: WorkflowRun['status'] }) {
  const { t } = useLocale();
  const variants: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }
  > = {
    running: { variant: 'default', icon: Clock },
    completed: { variant: 'secondary', icon: CheckCircle },
    error: { variant: 'destructive', icon: XCircle },
  };
  const { variant, icon: Icon } = variants[status] ?? { variant: 'outline', icon: AlertCircle };
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {t(`common:status.${status}`)}
    </Badge>
  );
}

function WorkflowCard({
  workflow,
  onTrigger,
  onToggle,
  onView,
  onEdit,
  onDelete,
}: {
  workflow: Workflow;
  onTrigger: () => void;
  onToggle: (enabled: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{workflow.name || workflow.id}</CardTitle>
            <CardDescription className="mt-1">
              {t('workflows:triggersOn')}:{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{workflow.trigger.event}</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onView}>
              <Eye className="mr-1 size-3" />
              {t('common:actions.view')}
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 size-3" />
              {t('common:actions.edit')}
            </Button>
            <Button size="sm" variant="outline" onClick={onTrigger}>
              <Play className="mr-1 size-3" />
              {t('workflows:actions.run')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="size-3 text-destructive" />
            </Button>
            <Switch checked={workflow.enabled} onCheckedChange={onToggle} />
          </div>
        </div>
      </CardHeader>
      {workflow.blocks && workflow.blocks.length > 0 && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-1.5">
            {workflow.blocks.map((block) => {
              const iconName = (block.icon || 'box') as IconName;
              return (
                <Badge key={block.id} variant="outline" className="gap-1 text-xs">
                  <DynamicIcon name={iconName} className="size-3" />
                  {block.id}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function RunsTable({ runs }: { runs: WorkflowRun[] }) {
  const { t, formatTime } = useLocale();

  if (runs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">{t('workflows:runs.empty')}</div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center justify-between rounded-lg border bg-card p-3"
        >
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <span className="font-medium text-sm">{run.workflowId}</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            {run.finishedAt && run.startedAt && (
              <span>{formatDuration(run.finishedAt - run.startedAt)}</span>
            )}
            <span>{formatTime(run.startedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockTypesGrid({ types }: { types: BlockType[] }) {
  const { tp } = useLocale();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {types.map((block) => {
        const iconName = (block.icon || 'box') as IconName;
        const color = block.color || '#6366f1';
        const blockKey = block.id.split(':').pop() || block.id;
        const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
        const blockDesc = tp(block.pluginId, `blocks.${blockKey}.description`, block.description);

        return (
          <div
            key={block.id}
            className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
          >
            <Avatar className="size-10 rounded-lg">
              <AvatarFallback
                className="rounded-lg"
                style={{ backgroundColor: `${color}20`, color }}
              >
                <DynamicIcon name={iconName} className="size-5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{blockName}</div>
              {blockDesc && (
                <div className="truncate text-muted-foreground text-xs">{blockDesc}</div>
              )}
            </div>
            {block.category && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {block.category}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Create a new empty workflow
function createNewWorkflow(): Workflow {
  const id = `workflow-${Date.now().toString(36)}`;
  return {
    id,
    name: 'New Workflow',
    enabled: false,
    trigger: { event: '*' },
    blocks: [
      { id: 'start', type: 'log', level: 'info', message: 'Workflow started', next: 'end' },
      { id: 'end', type: 'end' },
    ],
  };
}

function WorkflowEditorDialog({
  workflow,
  open,
  onClose,
  onSave,
}: {
  workflow: Workflow | null;
  open: boolean;
  onClose: () => void;
  onSave: (workflow: Workflow) => Promise<void>;
}) {
  if (!open || !workflow) return null;

  const handleSave = async (updated: Workflow) => {
    await onSave(updated);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            {workflow.name || workflow.id}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          <ReactFlowProvider>
            <WorkflowEditor workflow={workflow} readonly={false} onSave={handleSave} />
          </ReactFlowProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowViewerDialog({
  workflowId,
  open,
  onClose,
}: {
  workflowId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { data: workflow, isLoading } = useWorkflow(workflowId || '');

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{workflow?.name || workflowId}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-[500px] items-center justify-center text-muted-foreground">
            {t('common:loading')}
          </div>
        ) : workflow ? (
          <ReactFlowProvider>
            <WorkflowEditor workflow={workflow} readonly />
          </ReactFlowProvider>
        ) : (
          <div className="flex h-[500px] items-center justify-center text-muted-foreground">
            {t('workflows:notFound')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState('workflows');
  const [viewingWorkflow, setViewingWorkflow] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const {
    data: workflows = [],
    isLoading: loadingWorkflows,
    refetch: refetchWorkflows,
  } = useWorkflows();
  const { data: runs = [], isLoading: loadingRuns } = useWorkflowRuns();
  const { data: blockTypes = [] } = useBlockTypes();

  const triggerMutation = useTriggerWorkflow();
  const enableMutation = useEnableWorkflow();
  const disableMutation = useDisableWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const handleTrigger = (id: string) => {
    triggerMutation.mutate({ id });
  };

  const handleToggle = (id: string, enabled: boolean) => {
    if (enabled) {
      enableMutation.mutate(id);
    } else {
      disableMutation.mutate(id);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(t('workflows:confirmDelete', { id }))) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
  };

  const handleCreateNew = () => {
    setEditingWorkflow(createNewWorkflow());
  };

  const handleSave = async (workflow: Workflow) => {
    await saveWorkflow(workflow);
    refetchWorkflows();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">{t('workflows:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('workflows:subtitle')}</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 size-4" />
          {t('workflows:actions.create')}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workflows">{t('workflows:title')}</TabsTrigger>
          <TabsTrigger value="runs">{t('workflows:runs.title')}</TabsTrigger>
          <TabsTrigger value="blocks">{t('workflows:blocks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-6">
          {loadingWorkflows ? (
            <div className="text-muted-foreground">{t('common:loading')}</div>
          ) : workflows.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="mb-4 text-muted-foreground">{t('workflows:empty')}</p>
              <Button onClick={handleCreateNew}>
                <Plus className="mr-2 size-4" />
                {t('workflows:actions.create')}
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {workflows.map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onTrigger={() => handleTrigger(w.id)}
                  onToggle={(enabled) => handleToggle(w.id, enabled)}
                  onView={() => setViewingWorkflow(w.id)}
                  onEdit={() => handleEdit(w)}
                  onDelete={() => handleDelete(w.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs" className="mt-6">
          <ScrollArea className="h-[500px]">
            {loadingRuns ? (
              <div className="text-muted-foreground">{t('common:loading')}</div>
            ) : (
              <RunsTable runs={runs} />
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="blocks" className="mt-6">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">{t('workflows:blocksDescription')}</p>
            <BlockTypesGrid types={blockTypes} />
          </div>
        </TabsContent>
      </Tabs>

      <WorkflowViewerDialog
        workflowId={viewingWorkflow}
        open={!!viewingWorkflow}
        onClose={() => setViewingWorkflow(null)}
      />

      <WorkflowEditorDialog
        workflow={editingWorkflow}
        open={!!editingWorkflow}
        onClose={() => setEditingWorkflow(null)}
        onSave={handleSave}
      />
    </div>
  );
}
