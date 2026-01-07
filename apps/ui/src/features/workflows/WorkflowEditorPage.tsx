/**
 * Workflow Editor Page
 *
 * Full-page workflow editor with sidebar panels.
 * Routes: /workflows/new, /workflows/:id/edit
 */

import { useNavigate, useParams } from '@tanstack/react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { saveWorkflow, type Workflow } from './api';
import { WorkflowEditor } from './editor';
import { useWorkflow } from './hooks';

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

  // Local state for workflow
  const [workflow, setWorkflow] = useState<Workflow | null>(() =>
    isNew ? createNewWorkflow() : null
  );
  const [workflowName, setWorkflowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Update local state when existing workflow loads
  if (existingWorkflow && !workflow) {
    setWorkflow(existingWorkflow);
    setWorkflowName(existingWorkflow.name || existingWorkflow.id);
  }

  // Current workflow to display
  const currentWorkflow = workflow || existingWorkflow;

  // Handle name change
  const handleNameChange = useCallback((name: string) => {
    setWorkflowName(name);
    setIsDirty(true);
  }, []);

  // Handle save
  const handleSave = useCallback(
    async (updated: Workflow) => {
      setIsSaving(true);
      try {
        const toSave = {
          ...updated,
          name: workflowName || updated.name,
        };
        await saveWorkflow(toSave);
        setWorkflow(toSave);
        setIsDirty(false);

        // If new workflow, navigate to edit URL
        if (isNew) {
          navigate({ to: '/workflows/$id/edit', params: { id: toSave.id } });
        }
      } finally {
        setIsSaving(false);
      }
    },
    [workflowName, isNew, navigate]
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
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found state
  if (!isNew && !isLoading && !currentWorkflow) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('workflows:notFound')}</p>
        <Button variant="outline" onClick={() => navigate({ to: '/workflows' })}>
          <ArrowLeft className="mr-2 size-4" />
          {t('common:actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="mr-2 size-4" />
            {t('common:actions.back')}
          </Button>

          <div className="h-6 w-px bg-border" />

          <Input
            value={workflowName || currentWorkflow?.name || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('workflows:editor.workflowName')}
            className="h-8 w-64 border-none bg-transparent font-semibold text-lg shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-muted-foreground text-sm">{t('workflows:editor.unsaved')}</span>
          )}
          <Button
            size="sm"
            disabled={isSaving}
            onClick={() => currentWorkflow && handleSave(currentWorkflow)}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            {t('common:actions.save')}
          </Button>
        </div>
      </div>

      {/* Editor */}
      {currentWorkflow && (
        <div className="min-h-0 flex-1">
          <ReactFlowProvider>
            <WorkflowEditor workflow={currentWorkflow} readonly={false} onSave={handleSave} />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
