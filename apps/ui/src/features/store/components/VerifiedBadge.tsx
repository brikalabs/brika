import { BadgeCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/lib/use-locale';

export function VerifiedBadge() {
  const { t } = useLocale();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BadgeCheck className="size-4 shrink-0 fill-blue-500 text-white" strokeWidth={1.5} />
      </TooltipTrigger>
      <TooltipContent>
        <p>{t('store:badges.verifiedTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
