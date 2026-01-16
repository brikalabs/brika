/**
 * Workflow Editor Page
 *
 * Full-page workflow editor with sidebar panels.
 * Routes: /workflows/new, /workflows/:id/edit
 */

import { useNavigate, useParams } from '@tanstack/react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Workflow } from './api';
import { WorkflowEditor } from './editor';
import { useSaveWorkflow, useWorkflow } from './hooks';

// Create a new empty workflow
function createNewWorkflow(): Workflow {
  const id = `workflow-${Date.now().toString(36)}`;
  return {
    id,
    name: 'New Workflow',
    enabled: false,
    blocks: [],
    connections: [],
  };
}

export function WorkflowEditorPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const workflowId = (params as { id?: string }).id;
  const isNew = !workflowId;

  // Fetch existing workflow or create new
  const { data: existingWorkflow, isLoading } = useWorkflow(workflowId || '', {
    enabled: !!workflowId,
  });

  // Save workflow mutation with cache invalidation
  const saveWorkflowMutation = useSaveWorkflow();

  // Local state for workflow - tracks the latest state from the editor
  const [initialWorkflow, setInitialWorkflow] = useState<Workflow | null>(() =>
    isNew ? createNewWorkflow() : null
  );
  const [workflowName, setWorkflowName] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Track current workflow from editor in a ref to avoid re-renders
  const currentWorkflowRef = useRef<Workflow | null>(null);

  // Update local state when existing workflow loads
  if (existingWorkflow && !initialWorkflow) {
    setInitialWorkflow(existingWorkflow);
    setWorkflowName(existingWorkflow.name || existingWorkflow.id);
  }

  // Current workflow to display (initial only, editor maintains its own state)
  const currentWorkflow = initialWorkflow || existingWorkflow;

  // Handle workflow changes from editor
  const handleWorkflowChange = useCallback((workflow: Workflow, editorIsDirty: boolean) => {
    currentWorkflowRef.current = workflow;
    setIsDirty(editorIsDirty);
  }, []);

  // Handle name change
  const handleNameChange = useCallback((name: string) => {
    setWorkflowName(name);
    setIsDirty(true);
  }, []);

  // Handle save - uses the current workflow from the editor
  const handleSave = useCallback(
    async (workflow: Workflow) => {
      // Use the latest workflow from the ref if available
      const workflowToSave = currentWorkflowRef.current || workflow;

      const toSave = {
        ...workflowToSave,
        name: workflowName || workflowToSave.name,
      };

      await saveWorkflowMutation.mutateAsync(toSave);
      setInitialWorkflow(toSave);
      setIsDirty(false);

      // If new workflow, navigate to edit URL
      if (isNew) {
        navigate({ to: '/workflows/$id/edit', params: { id: toSave.id } });
      }
    },
    [workflowName, isNew, navigate, saveWorkflowMutation]
  );

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (isDirty) {
      if (confirm(t('workflows:editor.unsavedChanges'))) {
        navigate({ to: '/workflows' });
      }
    } else {
      navigate({ to: '/workflows' });
    }
  }, [isDirty, navigate, t]);

  // Loading state
  if (!isNew && isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found state
  if (!isNew && !isLoading && !currentWorkflow) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('workflows:notFound')}</p>
        <Button variant="outline" onClick={() => navigate({ to: '/workflows' })}>
          <ArrowLeft className="mr-2 size-4" />
          {t('common:actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-3.5 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
            <ArrowLeft className="size-4" />
            {t('common:actions.back')}
          </Button>

          <div className="h-6 w-px bg-border/50" />

          <Input
            value={workflowName || currentWorkflow?.name || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('workflows:editor.workflowName')}
            className="h-8 w-80 border-none bg-transparent font-semibold text-lg shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-muted-foreground text-xs">{t('workflows:editor.unsaved')}</span>
          )}
          <Button
            size="sm"
            disabled={saveWorkflowMutation.isPending}
            onClick={() => {
              const wf = currentWorkflowRef.current || currentWorkflow;
              if (wf) handleSave(wf);
            }}
            className="gap-2"
          >
            {saveWorkflowMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t('common:actions.save')}
          </Button>
        </div>
      </div>

      {/* Editor */}
      {currentWorkflow && (
        <div className="min-h-0 flex-1">
          <ReactFlowProvider>
            <WorkflowEditor
              workflow={currentWorkflow}
              readonly={false}
              onSave={handleSave}
              onChange={handleWorkflowChange}
            />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
