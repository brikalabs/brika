import { ArrowUpCircle, CheckCircle2, Code2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface UpdateBadgeProps {
  updateAvailable: boolean;
  devBuild: boolean;
  currentVersion: string;
  latestVersion: string;
}

export function UpdateBadge({
  updateAvailable,
  devBuild,
  currentVersion,
  latestVersion,
}: Readonly<UpdateBadgeProps>) {
  const { t } = useLocale();
  let variant: 'default' | 'outline' | 'secondary' = 'secondary';
  if (updateAvailable) {
    variant = 'default';
  } else if (devBuild) {
    variant = 'outline';
  }

  if (updateAvailable) {
    return (
      <Badge variant={variant}>
        <ArrowUpCircle className="size-3" />
        {t('common:updates.versionChange', {
          from: currentVersion,
          to: latestVersion,
        })}
      </Badge>
    );
  }
  if (devBuild) {
    return (
      <Badge variant={variant}>
        <Code2 className="size-3" />
        {t('common:updates.devBuild')}
      </Badge>
    );
  }
  return (
    <Badge variant={variant}>
      <CheckCircle2 className="size-3" />
      {t('common:updates.upToDate')}
    </Badge>
  );
}
