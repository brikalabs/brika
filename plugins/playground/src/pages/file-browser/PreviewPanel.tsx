import { Button, ScrollArea } from '@brika/sdk/ui-kit';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileQuestion,
  Music,
  X,
} from '@brika/sdk/ui-kit/icons';
import { useEffect, useState } from 'react';
import { describeFile } from './file-kind';
import { extOf, formatRelativeTime, formatSize } from './helpers';
import type { PreviewMeta, PreviewState } from './types';

interface PreviewPanelProps {
  preview: PreviewState;
  onClose: () => void;
  onDownload: () => void;
}

/* ─── small atoms ───────────────────────────────────────────────────────── */

function CopyChip({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const t = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}

function MetaRow({
  label,
  value,
  mono,
  copy,
}: Readonly<{ label: string; value: string; mono?: boolean; copy?: string }>) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-baseline gap-3 py-1.5">
      <dt className="font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.14em]">
        {label}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-foreground/90 text-xs ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </span>
        {copy && <CopyChip value={copy} label={label.toLowerCase()} />}
      </dd>
    </div>
  );
}

/* ─── preview body switch ───────────────────────────────────────────────── */

function PreviewBody({ preview }: Readonly<{ preview: Exclude<PreviewState, { kind: 'none' }> }>) {
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

/* ─── metadata block ────────────────────────────────────────────────────── */

function MetadataBlock({ name, meta }: Readonly<{ name: string; meta: PreviewMeta }>) {
  const ext = extOf(name).toUpperCase();
  const { label: kindLabel } = describeFile(name, false);
  return (
    <dl className="flex flex-col">
      <MetaRow label="Kind" value={kindLabel} />
      <MetaRow label="Type" value={meta.contentType} mono />
      <MetaRow label="Size" value={formatSize(meta.size, false)} mono />
      {meta.mtime > 0 && <MetaRow label="Modified" value={formatRelativeTime(meta.mtime)} />}
      <MetaRow label="Path" value={meta.virtualPath} mono copy={meta.virtualPath} />
      {ext && <MetaRow label="Format" value={ext} mono />}
    </dl>
  );
}

/* ─── panel ─────────────────────────────────────────────────────────────── */

export function PreviewPanel({ preview, onClose, onDownload }: Readonly<PreviewPanelProps>) {
  if (preview.kind === 'none') {
    return null;
  }

  const { Icon, fg, bg, label } = describeFile(preview.name, false);
  const canOpenExternal = preview.kind === 'image' || preview.kind === 'pdf';
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
        {canOpenExternal && externalUrl && (
          <a href={externalUrl} target="_blank" rel="noreferrer" className="contents">
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
