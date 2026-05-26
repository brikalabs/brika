import { FolderOpen } from '@brika/sdk/ui-kit/icons';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div
        aria-hidden
        className="flex size-14 items-center justify-center rounded-full bg-muted/60"
      >
        <FolderOpen className="size-7 text-muted-foreground/80" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sm">This folder is empty</p>
        <p className="text-muted-foreground text-xs">
          Drag files here, or use the{' '}
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Upload</span> button
          above.
        </p>
      </div>
    </div>
  );
}
