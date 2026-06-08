import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Shield } from '@brika/sdk/ui-kit/icons';

export function PermissionGate() {
  const { t } = useLocale();
  return (
    <EmptyState>
      <EmptyStateIcon>
        <Shield className="size-7 text-muted-foreground" />
      </EmptyStateIcon>
      <EmptyStateTitle>{t('fileBrowser.permission.title')}</EmptyStateTitle>
      <EmptyStateDescription>{t('fileBrowser.permission.description')}</EmptyStateDescription>
    </EmptyState>
  );
}
