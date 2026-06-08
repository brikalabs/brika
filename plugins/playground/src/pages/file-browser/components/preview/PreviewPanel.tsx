import { capture } from '@brika/sdk';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Check, Copy, Download, ExternalLink, X } from '@brika/sdk/ui-kit/icons';
import { useCallback, useEffect, useState } from 'react';
import { describeFile } from '../../lib/file-kind';
import { formatRelativeTime, formatSize } from '../../lib/format';
import { extOf } from '../../lib/path';
import type { PreviewMeta, PreviewState } from '../../types';
import { PreviewBody } from './PreviewBody';

function CopyButton({ value, label }: Readonly<{ value: string; label: string }>) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 shrink-0 [&_svg]:size-3"
          onClick={onCopy}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {copied
          ? t('fileBrowser.preview.copied', { label })
          : t('fileBrowser.preview.copy', { label })}
      </TooltipContent>
    </Tooltip>
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
        {copy && <CopyButton value={copy} label={label.toLowerCase()} />}
      </dd>
    </div>
  );
}

interface PreviewPanelProps {
  preview: PreviewState;
  onClose: () => void;
  onDownload: () => void;
}

export function PreviewPanel({ preview, onClose, onDownload }: Readonly<PreviewPanelProps>) {
  const { t } = useLocale();
  if (preview.kind === 'none') {
    return null;
  }

  const { Icon, fg, bg, kind, label } = describeFile(preview.name, false);
  const kindLabel = t(`fileBrowser.kind.${kind}`, { defaultValue: label });
  const externalUrl = preview.kind === 'image' || preview.kind === 'pdf' ? preview.url : null;
  const meta: PreviewMeta = preview.meta;
  const ext = extOf(preview.name).toUpperCase();

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
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
            <span>{kindLabel}</span>
            <span aria-hidden className="size-0.5 rounded-full bg-muted-foreground/40" />
            <span className="normal-case tracking-normal">{meta.contentType}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} className="-mr-1 shrink-0">
          <X className="size-3.5" />
        </Button>
      </header>

      <div className="bg-muted/20 p-4">
        <PreviewBody preview={preview} />
      </div>

      <div className="border-border/70 border-t px-4 py-3">
        <dl className="flex flex-col">
          <MetaRow label={t('fileBrowser.preview.kind')} value={kindLabel} />
          <MetaRow label={t('fileBrowser.preview.type')} value={meta.contentType} mono />
          <MetaRow
            label={t('fileBrowser.preview.size')}
            value={formatSize(meta.size, false)}
            mono
          />
          {meta.mtime > 0 && (
            <MetaRow
              label={t('fileBrowser.preview.modified')}
              value={formatRelativeTime(meta.mtime, t)}
            />
          )}
          <MetaRow
            label={t('fileBrowser.preview.path')}
            value={meta.virtualPath}
            mono
            copy={meta.virtualPath}
          />
          {ext && <MetaRow label={t('fileBrowser.preview.format')} value={ext} mono />}
        </dl>
      </div>

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
              {t('fileBrowser.preview.open')}
            </Button>
          </a>
        )}
        <Button variant="default" size="sm" onClick={onDownload} className="gap-1.5">
          <Download className="size-3.5" />
          {t('fileBrowser.actions.download')}
        </Button>
      </footer>
    </article>
  );
}
