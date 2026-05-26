import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockInfo,
} from '@brika/sdk/ui-kit';
import { FileQuestion, Music } from '@brika/sdk/ui-kit/icons';
import { shikiLanguageFor } from '../../lib/file-kind';
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
    // Clay's CodeBlock runs Shiki on the content for syntax highlighting,
    // ships a copy button, and handles its own overflow scrolling. The
    // header tucks the filename + line count to the side; unknown
    // extensions (`txt`/`md`) fall through to plain mono with no colours.
    const language = shikiLanguageFor(preview.name);
    return (
      <CodeBlock className="max-h-80">
        <CodeBlockHeader>
          <CodeBlockInfo>{({ lineCount }) => `${lineCount} lines`}</CodeBlockInfo>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
        <CodeBlockContent language={language} filename={preview.name} showLineNumbers size="sm">
          {preview.content}
        </CodeBlockContent>
      </CodeBlock>
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
