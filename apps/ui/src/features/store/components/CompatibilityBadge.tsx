import { AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/lib/use-locale';

interface CompatibilityBadgeProps {
  compatible: boolean;
  reason?: string;
}

export function CompatibilityBadge({ compatible, reason }: Readonly<CompatibilityBadgeProps>) {
  const { t } = useLocale();

  if (compatible) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600">
            <CheckCircle className="size-3" />
            {t('store:badges.compatible')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('store:badges.compatibleTooltip')}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 border-orange-500/30 text-orange-600">
          <AlertCircle className="size-3" />
          {t('store:badges.incompatible')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{reason || t('store:badges.incompatibleTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
