/**
 * Workflow Editor Page
 *
 * Full-page workflow editor with sidebar panels. Changes autosave: there is
 * no Save button and no unsaved-changes dialog, only a status indicator.
 * Routes: /workflows/new, /workflows/:id/edit
 */

import { Button, Input } from '@brika/clay';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Check, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import type { Workflow } from './api';
import { WorkflowEditor } from './editor';
import { useSaveWorkflow, useWorkflow } from './hooks';

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

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

function SaveStatusIndicator({
  state,
  onRetry,
}: Readonly<{
  state: SaveState;
  onRetry: () => void;
}>) {
  const { t } = useLocale();

  if (state === 'error') {
    return (
      <Button size="sm" variant="destructive" onClick={onRetry} className="gap-2">
        <RefreshCw className="size-4" />
        {t('workflows:editor.autosave.retry')}
      </Button>
    );
  }
  if (state === 'saving' || state === 'pending') {
    return (
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {t('workflows:editor.autosave.saving')}
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        <Check className="size-3.5 text-status-completed" />
        {t('workflows:editor.autosave.saved')}
      </span>
    );
  }
  return null;
}

export function WorkflowEditorPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const capture = useCapture();
  const queryClient = useQueryClient();
  const params = useParams({
    strict: false,
  });
  const workflowId = (
    params as {
      id?: string;
    }
  ).id;
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
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Latest editor state in refs so the debounced save never goes stale
  const currentWorkflowRef = useRef<Workflow | null>(null);
  const workflowNameRef = useRef('');
  workflowNameRef.current = workflowName;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local state when existing workflow loads
  if (existingWorkflow && !initialWorkflow) {
    setInitialWorkflow(existingWorkflow);
    setWorkflowName(existingWorkflow.name || existingWorkflow.id);
  }

  // Current workflow to display (initial only, editor maintains its own state)
  const currentWorkflow = initialWorkflow || existingWorkflow;

  const performSave = useCallback(async () => {
    const base = currentWorkflowRef.current;
    if (!base) {
      return;
    }
    const toSave = {
      ...base,
      name: workflowNameRef.current || base.name,
    };
    setSaveState('saving');
    try {
      await saveWorkflowMutation.mutateAsync(toSave);
      setInitialWorkflow(toSave);
      setSaveState('saved');
      capture('workflow.autosaved', {
        id: toSave.id,
        isNew,
        blockCount: toSave.blocks?.length ?? 0,
      });
      // First save of a brand-new workflow: move to its edit URL. The
      // query cache is seeded so the remounted editor renders instantly.
      if (isNew) {
        queryClient.setQueryData(['workflows', toSave.id], toSave);
        navigate({
          to: paths.workflows.edit.to({
            id: toSave.id,
          }),
          replace: true,
        });
      }
    } catch {
      setSaveState('error');
    }
  }, [saveWorkflowMutation, capture, isNew, queryClient, navigate]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave();
  }, [performSave]);

  const scheduleSave = useCallback(() => {
    setSaveState((state) => (state === 'saving' ? state : 'pending'));
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void performSave();
    }, AUTOSAVE_DELAY_MS);
  }, [performSave]);

  // Clear any pending timer on unmount (back/away already flushed)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Cmd+S saves immediately (autosave would have caught up anyway)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushSave]);

  // Handle workflow changes from editor
  const handleWorkflowChange = useCallback(
    (workflow: Workflow, editorIsDirty: boolean) => {
      currentWorkflowRef.current = workflow;
      if (editorIsDirty) {
        scheduleSave();
      }
    },
    [scheduleSave]
  );

  // Handle name change
  const handleNameChange = useCallback(
    (name: string) => {
      setWorkflowName(name);
      scheduleSave();
    },
    [scheduleSave]
  );

  // Handle back navigation: flush any pending changes, no dialog
  const handleBack = useCallback(() => {
    const hasPending = saveTimerRef.current !== null || saveState === 'pending';
    capture('workflow.editor_back', { pendingSave: hasPending });
    if (hasPending) {
      flushSave();
    }
    navigate({
      to: paths.workflows.list.path,
    });
  }, [saveState, flushSave, navigate, capture]);

  // Loading state
  if (!isNew && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found state
  if (!isNew && !isLoading && !currentWorkflow) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('workflows:notFound')}</p>
        <Button
          variant="outline"
          onClick={() => {
            capture('workflow.not_found_back');
            navigate({
              to: paths.workflows.list.path,
            });
          }}
        >
          <ArrowLeft className="mr-2 size-4" />
          {t('common:actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
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
          <SaveStatusIndicator state={saveState} onRetry={flushSave} />
        </div>
      </div>

      {/* Editor */}
      {currentWorkflow && (
        <div className="min-h-0 flex-1">
          <ReactFlowProvider>
            <WorkflowEditor
              workflow={currentWorkflow}
              readonly={false}
              onChange={handleWorkflowChange}
            />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
