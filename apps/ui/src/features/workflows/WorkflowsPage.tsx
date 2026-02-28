/**
 * Workflows Page
 *
 * Table view of all workflows with status, actions, and navigation to editor.
 */

import { useNavigate } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useDataView } from '@/components/DataView';
import { Button, Card, Input } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { routes } from '@/routes';
import type { Workflow } from './api';
import { DebugDialog, DeleteDialog, WorkflowsTable, WorkflowTableSkeleton } from './components';
import { useDeleteWorkflow, useDisableWorkflow, useEnableWorkflow, useWorkflows } from './hooks';

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

  const handleToggle = ({ id, enabled }: { id: string; enabled: boolean }) => {
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

  const View = useDataView({ data: filteredWorkflows, isLoading: loadingWorkflows });

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
          <Button onClick={() => navigate({ to: routes.workflows.new.path })}>
            <Plus className="mr-2 size-4" />
            {t('workflows:actions.create')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <View.Root>
        <View.Skeleton>
          <WorkflowTableSkeleton rows={4} />
        </View.Skeleton>

        <View.Empty>
          <Card className="p-12 text-center">
            <p className="mb-4 text-muted-foreground">
              {search ? t('workflows:noResults') : t('workflows:empty')}
            </p>
            {!search && (
              <Button onClick={() => navigate({ to: routes.workflows.new.path })}>
                <Plus className="mr-2 size-4" />
                {t('workflows:actions.create')}
              </Button>
            )}
          </Card>
        </View.Empty>

        <View.Content>
          {(workflows) => (
            <WorkflowsTable
              workflows={workflows}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onDebug={handleDebug}
            />
          )}
        </View.Content>
      </View.Root>

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
