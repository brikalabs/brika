import { Button, Input } from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDataView } from '@/components/DataView';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import type { BlockDefinition, Workflow } from './api';
import {
  DebugDialog,
  DeleteDialog,
  WorkflowCard,
  WorkflowCardSkeleton,
  WorkflowsEmpty,
} from './components';
import {
  useBlockTypes,
  useDeleteWorkflow,
  useDisableWorkflow,
  useEnableWorkflow,
  useWorkflows,
} from './hooks';

export function WorkflowsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [debugWorkflow, setDebugWorkflow] = useState<Workflow | null>(null);

  const { data: workflows = [], isLoading } = useWorkflows();
  const { data: blockTypesArray = [] } = useBlockTypes();
  const enableMutation = useEnableWorkflow();
  const disableMutation = useDisableWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const blockTypes = useMemo(() => {
    const map = new Map<string, BlockDefinition>();
    for (const bt of blockTypesArray) {
      map.set(bt.type, bt);
      map.set(bt.id, bt);
    }
    return map;
  }, [blockTypesArray]);

  const handleToggle = ({ id, enabled }: { id: string; enabled: boolean }) => {
    (enabled ? enableMutation : disableMutation).mutate(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  // Filter and partition into errored / healthy
  const { errored, healthy } = useMemo(() => {
    const lc = search.toLowerCase();
    const filtered = workflows.filter(
      (w) => !search || w.id.toLowerCase().includes(lc) || w.name?.toLowerCase().includes(lc)
    );
    const e: Workflow[] = [];
    const h: Workflow[] = [];
    for (const w of filtered) {
      (w.status === 'error' ? e : h).push(w);
    }
    return { errored: e, healthy: h };
  }, [workflows, search]);

  const View = useDataView({
    data: [...errored, ...healthy],
    isLoading,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('workflows:title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('workflows:subtitle')}
            {!isLoading && workflows.length > 0 && (
              <span className="ml-2 font-medium">
                · {t('workflows:count', { count: workflows.length })}
              </span>
            )}
          </p>
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
          <Button onClick={() => navigate({ to: paths.workflows.new.path })}>
            <Plus className="mr-2 size-4" />
            {t('workflows:actions.create')}
          </Button>
        </div>
      </div>

      <View.Root>
        <View.Skeleton>
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <WorkflowCardSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        </View.Skeleton>

        <View.Empty>
          <WorkflowsEmpty hasSearch={!!search} />
        </View.Empty>

        <View.Content>
          {() => (
            <div className="space-y-5">
              {errored.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <AlertTriangle className="size-3.5 text-destructive" />
                    <span className="font-medium uppercase tracking-wider">
                      {t('workflows:errors', { count: errored.length })}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {errored.map((w) => (
                      <WorkflowCard
                        key={w.id}
                        workflow={w}
                        blockTypes={blockTypes}
                        onToggle={handleToggle}
                        onDelete={setDeleteId}
                        onDebug={setDebugWorkflow}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                {healthy.map((w) => (
                  <WorkflowCard
                    key={w.id}
                    workflow={w}
                    blockTypes={blockTypes}
                    onToggle={handleToggle}
                    onDelete={setDeleteId}
                    onDebug={setDebugWorkflow}
                  />
                ))}
              </div>
            </div>
          )}
        </View.Content>
      </View.Root>

      <DeleteDialog
        workflowId={deleteId}
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
      <DebugDialog
        workflowId={debugWorkflow?.id ?? null}
        workflowName={debugWorkflow?.name}
        open={!!debugWorkflow}
        onClose={() => setDebugWorkflow(null)}
      />
    </div>
  );
}
