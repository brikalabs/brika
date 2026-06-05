import { capture } from '@brika/sdk';
import { Button } from '@brika/sdk/ui-kit';
import { Download, ExternalLink, X } from '@brika/sdk/ui-kit/icons';
import { describeFile } from '../../lib/file-kind';
import type { PreviewState } from '../../types';
import { MetadataBlock } from './MetadataBlock';
import { PreviewBody } from './PreviewBody';

interface PreviewPanelProps {
  preview: PreviewState;
  onClose: () => void;
  onDownload: () => void;
}

export function PreviewPanel({ preview, onClose, onDownload }: Readonly<PreviewPanelProps>) {
  if (preview.kind === 'none') {
    return null;
  }

  const { Icon, fg, bg, label } = describeFile(preview.name, false);
  const externalUrl = preview.kind === 'image' || preview.kind === 'pdf' ? preview.url : null;

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header — type-tinted medallion, name, MIME + size summary, close. */}
      <header className="flex items-start gap-3 border-border/70 border-b px-4 py-3">
        <span
          aria-hidden
          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${bg}`}
        >
          <Icon className={`size-4 ${fg}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-medium text-foreground text-sm leading-tight"
            title={preview.name}
          >
            {preview.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            <span>{label}</span>
            <span aria-hidden className="size-0.5 rounded-full bg-muted-foreground/40" />
            <span className="normal-case tracking-normal">{preview.meta.contentType}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} className="-mr-1 shrink-0">
          <X className="size-3.5" />
        </Button>
      </header>

      {/* Preview surface — image / text / pdf / generic placeholder. */}
      <div className="bg-muted/20 p-4">
        <PreviewBody preview={preview} />
      </div>

      {/* Metadata — definition list, monospace where it earns its keep. */}
      <div className="border-border/70 border-t px-4 py-3">
        <MetadataBlock name={preview.name} meta={preview.meta} />
      </div>

      {/* Footer — primary download + secondary "open in tab" when applicable. */}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-border/70 border-t px-4 py-3">
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="contents"
            onClick={() => capture('playground.preview_opened_external', { kind: preview.kind })}
          >
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ExternalLink className="size-3.5" />
              Open
            </Button>
          </a>
        )}
        <Button variant="default" size="sm" onClick={onDownload} className="gap-1.5">
          <Download className="size-3.5" />
          Download
        </Button>
      </footer>
    </article>
  );
}
