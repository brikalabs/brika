import { Status, StatusIndicator, StatusLabel } from '@brika/clay';
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
      <Status variant="info">
        <StatusIndicator />
        <StatusLabel>
          {t('common:updates.versionChange', {
            from: currentVersion,
            to: latestVersion,
          })}
        </StatusLabel>
      </Status>
    );
  }
  // channelMismatch is checked *before* devBuild so the more specific copy
  // wins when both could apply — the hub already keeps them mutually
  // exclusive but defense-in-depth costs nothing here.
  if (channelMismatch) {
    return (
      <Status variant="warning">
        <StatusIndicator pulse={false} />
        <StatusLabel>{t('common:updates.canaryBuild')}</StatusLabel>
      </Status>
    );
  }
  if (devBuild) {
    return (
      <Status variant="neutral">
        <StatusIndicator pulse={false} />
        <StatusLabel>{t('common:updates.devBuild')}</StatusLabel>
      </Status>
    );
  }
  return (
    <Status variant="success">
      <StatusIndicator pulse={false} />
      <StatusLabel>{t('common:updates.upToDate')}</StatusLabel>
    </Status>
  );
}
