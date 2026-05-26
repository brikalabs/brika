import { Upload } from '@brika/sdk/ui-kit/icons';

export function DropOverlay() {
  return (
    <div className="pointer-events-none flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/30 ring-offset-4 ring-offset-card">
        <Upload className="size-7 animate-bounce text-primary" />
      </div>
      <p className="font-medium text-primary text-sm">Drop to upload</p>
    </div>
  );
}
