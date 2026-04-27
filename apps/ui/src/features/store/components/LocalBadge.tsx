import { Badge } from '@brika/clay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay/components/tooltip';
import { HardDrive } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

export function LocalBadge() {
  const { t } = useLocale();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="h-5 gap-1 border-amber-500/30 bg-amber-500/10 font-medium text-amber-700 text-xs dark:text-amber-400"
        >
          <HardDrive className="size-3" />
          {t('store:badges.local')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t('store:badges.localTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
