import React, { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Eye,
  Plus,
  GitBranch,
  Square,
  Timer,
  Send,
  Edit,
  FileText,
  Shuffle,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useWorkflows,
  useWorkflow,
  useWorkflowRuns,
  useBlockTypes,
  useTriggerWorkflow,
  useEnableWorkflow,
  useDisableWorkflow,
  useSaveWorkflow,
  useDeleteWorkflow,
} from "./hooks";
import { WorkflowEditor } from "./editor";
import { saveWorkflow } from "./api";
import type { Workflow, WorkflowRun, BlockType } from "./api";

const BLOCK_ICONS: Record<string, React.ElementType> = {
  action: Zap,
  condition: GitBranch,
  switch: Shuffle,
  delay: Timer,
  emit: Send,
  set: Edit,
  log: FileText,
  end: Square,
};

function getBlockIcon(type: string) {
  return BLOCK_ICONS[type] || Square;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function StatusBadge({ status }: { status: WorkflowRun["status"] }) {
  const variants: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
  > = {
    running: { variant: "default", icon: Clock },
    completed: { variant: "secondary", icon: CheckCircle },
    error: { variant: "destructive", icon: XCircle },
  };
  const { variant, icon: Icon } = variants[status] ?? { variant: "outline", icon: AlertCircle };
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {status}
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{workflow.name || workflow.id}</CardTitle>
            <CardDescription className="mt-1">
              Triggers on:{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{workflow.trigger.event}</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onView}>
              <Eye className="size-3 mr-1" />
              View
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="size-3 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={onTrigger}>
              <Play className="size-3 mr-1" />
              Run
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
              const Icon = getBlockIcon(block.type);
              return (
                <Badge key={block.id} variant="outline" className="gap-1 text-xs">
                  <Icon className="size-3" />
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
  if (runs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No runs yet. Trigger a workflow to see execution history.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <span className="font-medium text-sm">{run.workflowId}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {run.finishedAt && run.startedAt && <span>{formatDuration(run.finishedAt - run.startedAt)}</span>}
            <span>{formatTime(run.startedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockTypesGrid({ types }: { types: BlockType[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {types.map((block) => {
        // Use icon from block definition, fallback to id-based lookup
        const blockId = block.id.split(":").pop() || block.id;
        const Icon = getBlockIcon(blockId);
        return (
          <Card key={block.type || block.id} className="p-4">
            <div className="flex items-center gap-3">
              <div
                className="size-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: block.color + "20", color: block.color }}
              >
                <Icon className="size-5" />
              </div>
              <div>
                <div className="font-medium text-sm">{block.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{block.type || block.id}</div>
              </div>
            </div>
          </Card>
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
    name: "New Workflow",
    enabled: false,
    trigger: { event: "*" },
    blocks: [
      { id: "start", type: "log", level: "info", message: "Workflow started", next: "end" },
      { id: "end", type: "end" },
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
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            {workflow.name || workflow.id}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
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
  const { data: workflow, isLoading } = useWorkflow(workflowId || "");

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{workflow?.name || workflowId}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            Loading workflow...
          </div>
        ) : workflow ? (
          <ReactFlowProvider>
            <WorkflowEditor workflow={workflow} readonly />
          </ReactFlowProvider>
        ) : (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            Workflow not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsPage() {
  const [tab, setTab] = useState("workflows");
  const [viewingWorkflow, setViewingWorkflow] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const { data: workflows = [], isLoading: loadingWorkflows, refetch: refetchWorkflows } = useWorkflows();
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

  const handleDelete = async (id: string) => {
    if (confirm(`Delete workflow "${id}"?`)) {
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
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground mt-1">Block-based automations triggered by events</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="size-4 mr-2" />
          New Workflow
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="blocks">Block Types</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-6">
          {loadingWorkflows ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : workflows.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">
                No workflows yet. Create one using the button above or add a YAML file in the{" "}
                <code className="bg-muted px-1 py-0.5 rounded">automations/</code> folder.
              </p>
              <Button onClick={handleCreateNew}>
                <Plus className="size-4 mr-2" />
                Create Workflow
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
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <RunsTable runs={runs} />
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="blocks" className="mt-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Available block types for building workflows</p>
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
