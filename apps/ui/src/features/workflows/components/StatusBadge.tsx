/**
 * StatusBadge Component
 *
 * Displays workflow status with appropriate styling and icons.
 */

import { AlertCircle, Play, Square } from 'lucide-react';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { WorkflowStatus } from '../api';

interface StatusBadgeProps {
  status?: WorkflowStatus;
  error?: string;
}

export function StatusBadge({ status, error }: Readonly<StatusBadgeProps>) {
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
