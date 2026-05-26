import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/sdk/ui-kit';
import { Shield } from '@brika/sdk/ui-kit/icons';

export function PermissionGate() {
  return (
    <EmptyState>
      <EmptyStateIcon>
        <Shield className="size-7 text-muted-foreground" />
      </EmptyStateIcon>
      <EmptyStateTitle>Filesystem access required</EmptyStateTitle>
      <EmptyStateDescription>
        Enable the <span className="font-medium text-foreground">Filesystem</span> permission in the
        Permissions card to browse and manage files.
      </EmptyStateDescription>
    </EmptyState>
  );
}
