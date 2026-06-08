import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dropzone,
  DropzoneDescription,
  DropzoneIcon,
  DropzoneTitle,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { CircleCheck, CloudUpload, Download, Trash2 } from '@brika/sdk/ui-kit/icons';
import { useState } from 'react';
import { formatRelativeTime, formatSize } from '../lib/format';
import type { Translate } from '../lib/i18n';
import type { FsEntry, UploadItem, UploadStatus } from '../types';
import { EntryIcon } from './EntryIcon';

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const;

interface EntryListProps {
  entries: FsEntry[];
  uploads: UploadItem[];
  loading: boolean;
  onNavigate: (name: string) => void;
  onPreview: (entry: FsEntry) => void;
  onDownload: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
  onUpload: (files: File[]) => void;
}

function uploadStatusLabel(status: UploadStatus, t: Translate): string {
  if (status === 'done') {
    return t('fileBrowser.upload.uploaded');
  }
  if (status === 'uploading') {
    return t('fileBrowser.upload.uploading');
  }
  return t('fileBrowser.upload.queued');
}

function UploadStatusIcon({ status }: Readonly<{ status: UploadStatus }>) {
  if (status === 'uploading') {
    return <Spinner size="sm" className="text-primary" />;
  }
  if (status === 'done') {
    return <CircleCheck className="size-4 text-success" />;
  }
  return <CloudUpload className="size-4 text-muted-foreground/60" />;
}

/**
 * Ghost row for an in-flight upload. Mirrors the EntryRow column layout so
 * the file appears in place as it lands, then gets replaced by the real
 * entry once the directory reloads.
 */
function UploadRow({ item }: Readonly<{ item: UploadItem }>) {
  const { t } = useLocale();
  return (
    <TableRow className="bg-primary/[0.04] hover:bg-primary/[0.04]">
      <TableCell className="w-10 py-2 pr-1 pl-3">
        <UploadStatusIcon status={item.status} />
      </TableCell>
      <TableCell className="truncate py-2 font-medium text-foreground/80 text-sm">
        {item.file.name}
      </TableCell>
      <TableCell className="hidden w-20 py-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:table-cell">
        {formatSize(item.file.size, false)}
      </TableCell>
      <TableCell className="hidden w-24 py-2 text-right text-[11px] text-muted-foreground md:table-cell">
        {uploadStatusLabel(item.status, t)}
      </TableCell>
      <TableCell className="w-[72px] py-2 pr-3" aria-hidden />
    </TableRow>
  );
}

function DeleteConfirm({
  entry,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<{
  entry: FsEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}>) {
  const { t } = useLocale();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              entry.isDirectory ? 'fileBrowser.delete.titleFolder' : 'fileBrowser.delete.titleFile'
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              entry.isDirectory
                ? 'fileBrowser.delete.descriptionFolder'
                : 'fileBrowser.delete.descriptionFile',
              { name: entry.name }
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('fileBrowser.actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {t('fileBrowser.actions.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntryRow({
  entry,
  onNavigate,
  onPreview,
  onDownload,
  onDelete,
}: Readonly<{
  entry: FsEntry;
  onNavigate: (name: string) => void;
  onPreview: (entry: FsEntry) => void;
  onDownload: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
}>) {
  const { t } = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleRowClick() {
    if (entry.isDirectory) {
      onNavigate(entry.name);
    } else {
      onPreview(entry);
    }
  }

  return (
    <>
      <TableRow className="group cursor-pointer" onClick={handleRowClick}>
        <TableCell className="w-10 py-2 pr-1 pl-3">
          <EntryIcon entry={entry} />
        </TableCell>
        <TableCell className="truncate py-2 font-medium text-foreground text-sm">
          {entry.name}
        </TableCell>
        <TableCell className="hidden w-20 py-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:table-cell">
          {formatSize(entry.size, entry.isDirectory)}
        </TableCell>
        <TableCell className="hidden w-24 py-2 text-right text-[11px] text-muted-foreground md:table-cell">
          {formatRelativeTime(entry.mtime, t)}
        </TableCell>
        <TableCell className="w-[72px] py-2 pr-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {entry.isFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => onDownload(entry)}
                  >
                    <Download className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('fileBrowser.actions.download')}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('fileBrowser.actions.delete')}</TooltipContent>
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>

      <DeleteConfirm
        entry={entry}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => onDelete(entry)}
      />
    </>
  );
}

export function EntryList({
  entries,
  uploads,
  loading,
  onNavigate,
  onPreview,
  onDownload,
  onDelete,
  onUpload,
}: Readonly<EntryListProps>) {
  const { t } = useLocale();
  if (loading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  // Only fall back to the drop card when there is nothing at all to show —
  // an in-flight upload into an empty folder still renders as a ghost row.
  if (entries.length === 0 && uploads.length === 0) {
    return (
      <div className="p-4">
        <Dropzone multiple onDrop={onUpload}>
          <DropzoneIcon />
          <DropzoneTitle>{t('fileBrowser.empty.title')}</DropzoneTitle>
          <DropzoneDescription>{t('fileBrowser.empty.hint')}</DropzoneDescription>
        </Dropzone>
      </div>
    );
  }

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 py-2 pr-1 pl-3" aria-hidden />
          <TableHead className="py-2 font-medium text-muted-foreground text-xs">
            {t('fileBrowser.columns.name')}
          </TableHead>
          <TableHead className="hidden w-20 py-2 text-right font-medium text-muted-foreground text-xs sm:table-cell">
            {t('fileBrowser.columns.size')}
          </TableHead>
          <TableHead className="hidden w-24 py-2 text-right font-medium text-muted-foreground text-xs md:table-cell">
            {t('fileBrowser.columns.modified')}
          </TableHead>
          <TableHead className="w-[72px] py-2 pr-3" aria-hidden />
        </TableRow>
      </TableHeader>
      <TableBody>
        {uploads.map((item) => (
          <UploadRow key={item.id} item={item} />
        ))}
        {entries.map((entry) => (
          <EntryRow
            key={entry.name}
            entry={entry}
            onNavigate={onNavigate}
            onPreview={onPreview}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
