import {
  EmptyState as ClayEmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/sdk/ui-kit';
import { FolderOpen } from '@brika/sdk/ui-kit/icons';

export function EmptyState() {
  return (
    <ClayEmptyState>
      <EmptyStateIcon>
        <FolderOpen className="size-7 text-muted-foreground/80" />
      </EmptyStateIcon>
      <EmptyStateTitle>This folder is empty</EmptyStateTitle>
      <EmptyStateDescription>
        Drag files here, or use the{' '}
        <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Upload</span> button
        above.
      </EmptyStateDescription>
    </ClayEmptyState>
  );
}
