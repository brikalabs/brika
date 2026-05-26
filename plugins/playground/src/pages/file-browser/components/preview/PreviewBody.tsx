import { ScrollArea } from '@brika/sdk/ui-kit';
import { FileQuestion, Music } from '@brika/sdk/ui-kit/icons';
import type { PreviewState } from '../../types';

type Rendered = Exclude<PreviewState, { kind: 'none' }>;

export function PreviewBody({ preview }: Readonly<{ preview: Rendered }>) {
  if (preview.kind === 'image') {
    return (
      <div className="flex items-center justify-center overflow-hidden rounded-md border border-border/60 bg-checkerboard">
        <img src={preview.url} alt={preview.name} className="max-h-72 w-full object-contain" />
      </div>
    );
  }

  if (preview.kind === 'pdf') {
    // Blob URLs play nicely with both Chrome's built-in PDF viewer and
    // Safari's. We use an <iframe> (not <embed>) so the viewer chrome
    // renders consistently and a graceful fallback link can sit inside.
    return (
      <iframe
        src={preview.url}
        title={preview.name}
        className="h-96 w-full rounded-md border border-border/60 bg-background"
      />
    );
  }

  if (preview.kind === 'audio') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border/60 bg-background/60 p-6">
        <div
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full bg-data-7/10 ring-1 ring-data-7/20"
        >
          <Music className="size-7 text-data-7" />
        </div>
        <audio
          controls
          src={preview.url}
          className="w-full"
          aria-label={`Audio preview for ${preview.name}`}
        >
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (preview.kind === 'video') {
    return (
      <div className="overflow-hidden rounded-md border border-border/60 bg-black">
        <video
          controls
          src={preview.url}
          className="max-h-80 w-full"
          aria-label={`Video preview for ${preview.name}`}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  if (preview.kind === 'text') {
    return (
      <ScrollArea className="h-72 rounded-md border border-border/60 bg-background">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] text-foreground/90 leading-relaxed">
          {preview.content}
        </pre>
      </ScrollArea>
    );
  }

  // generic — opaque binary the browser can't show inline.
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-md border border-border/60 border-dashed bg-background/40 text-center">
      <FileQuestion className="size-10 text-muted-foreground/60" />
      <p className="text-muted-foreground text-xs">No inline preview available</p>
      <p className="font-mono text-[10px] text-muted-foreground/60">Download to inspect</p>
    </div>
  );
}
