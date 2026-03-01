/**
 * WorkflowsTable Component
 *
 * Table display of workflows with status, blocks preview, and action buttons.
 */

import { Link, useNavigate } from '@tanstack/react-router';
import { Bug, Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import type { Workflow } from '../api';
import { BlocksPreview } from './BlocksPreview';
import { StatusBadge } from './StatusBadge';

interface WorkflowsTableProps {
  workflows: Workflow[];
  onToggle: (options: { id: string; enabled: boolean }) => void;
  onDelete: (id: string) => void;
  onDebug: (workflow: Workflow) => void;
}

export function WorkflowsTable({
  workflows,
  onToggle,
  onDelete,
  onDebug,
}: Readonly<WorkflowsTableProps>) {
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
            const isError = workflow.status === 'error';
            const isRunning = workflow.status === 'running';

            return (
              <TableRow key={workflow.id} className="group">
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Link
                      to={paths.workflows.edit.to({
                        id: workflow.id,
                      })}
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
                  <BlocksPreview blocks={workflow.blocks} />
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
                        navigate({
                          to: paths.workflows.edit.to({
                            id: workflow.id,
                          }),
                        })
                      }
                      title={t('common:actions.edit')}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Switch
                      checked={workflow.enabled}
                      onCheckedChange={(checked) =>
                        onToggle({
                          id: workflow.id,
                          enabled: checked,
                        })
                      }
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
