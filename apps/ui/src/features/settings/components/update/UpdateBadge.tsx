import { Badge } from '@brika/clay';
import { ArrowUpCircle, CheckCircle2, Code2, FlaskConical } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

interface UpdateBadgeProps {
  updateAvailable: boolean;
  devBuild: boolean;
  channelMismatch: boolean;
  currentVersion: string;
  latestVersion: string;
}

export function UpdateBadge({
  updateAvailable,
  devBuild,
  channelMismatch,
  currentVersion,
  latestVersion,
}: Readonly<UpdateBadgeProps>) {
  const { t } = useLocale();

  if (updateAvailable) {
    return (
      <Badge variant="default">
        <ArrowUpCircle className="size-3" />
        {t('common:updates.versionChange', {
          from: currentVersion,
          to: latestVersion,
        })}
      </Badge>
    );
  }
  // channelMismatch is checked *before* devBuild so the more specific copy
  // wins when both could apply — the hub already keeps them mutually
  // exclusive but defense-in-depth costs nothing here.
  if (channelMismatch) {
    return (
      <Badge variant="outline">
        <FlaskConical className="size-3" />
        {t('common:updates.canaryBuild')}
      </Badge>
    );
  }
  if (devBuild) {
    return (
      <Badge variant="outline">
        <Code2 className="size-3" />
        {t('common:updates.devBuild')}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <CheckCircle2 className="size-3" />
      {t('common:updates.upToDate')}
    </Badge>
  );
}
