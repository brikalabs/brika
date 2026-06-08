import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ButtonGroup,
  Breadcrumb as ClayBreadcrumb,
  FileUpload,
  FileUploadTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  Clock,
  FolderPlus,
  HardDrive,
  Upload,
} from '@brika/sdk/ui-kit/icons';
import type { SortKey } from '../types';

const ROOT_LABEL = 'data';

const SORT_OPTIONS: { value: SortKey; labelKey: string; icon: React.ReactNode }[] = [
  {
    value: 'name-asc',
    labelKey: 'fileBrowser.sort.nameAsc',
    icon: <ArrowDownAZ className="size-3.5" />,
  },
  {
    value: 'name-desc',
    labelKey: 'fileBrowser.sort.nameDesc',
    icon: <ArrowUpAZ className="size-3.5" />,
  },
  { value: 'newest', labelKey: 'fileBrowser.sort.newest', icon: <Clock className="size-3.5" /> },
  { value: 'oldest', labelKey: 'fileBrowser.sort.oldest', icon: <Clock className="size-3.5" /> },
  {
    value: 'largest',
    labelKey: 'fileBrowser.sort.largest',
    icon: <ArrowDownNarrowWide className="size-3.5" />,
  },
  {
    value: 'smallest',
    labelKey: 'fileBrowser.sort.smallest',
    icon: <ArrowUpNarrowWide className="size-3.5" />,
  },
];

function isSortKey(value: string): value is SortKey {
  return SORT_OPTIONS.some((opt) => opt.value === value);
}

interface ToolbarProps {
  path: string;
  summary: string;
  sortKey: SortKey;
  newFolderDisabled: boolean;
  onNavigate: (path: string) => void;
  onSortChange: (key: SortKey) => void;
  onNewFolder: () => void;
  onUpload: (files: File[]) => void;
}

export function Toolbar({
  path,
  summary,
  sortKey,
  newFolderDisabled,
  onNavigate,
  onSortChange,
  onNewFolder,
  onUpload,
}: Readonly<ToolbarProps>) {
  const { t } = useLocale();
  const segments = path.split('/').filter(Boolean);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b pb-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <ClayBreadcrumb aria-label={t('fileBrowser.toolbar.pathLabel')}>
          <BreadcrumbList>
            {segments.map((seg, idx) => {
              const segPath = `/${segments.slice(0, idx + 1).join('/')}`;
              const isLast = idx === segments.length - 1;
              const isRoot = idx === 0;
              const label = isRoot ? ROOT_LABEL : seg;
              return (
                <BreadcrumbItem key={segPath}>
                  {idx > 0 && <BreadcrumbSeparator />}
                  {isLast ? (
                    <BreadcrumbPage className="flex items-center gap-1.5 truncate font-semibold">
                      {isRoot && <HardDrive aria-hidden className="size-3.5 shrink-0" />}
                      {label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="flex items-center gap-1.5 truncate">
                      <button type="button" onClick={() => onNavigate(segPath)}>
                        {isRoot && <HardDrive aria-hidden className="size-3.5 shrink-0" />}
                        {label}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </ClayBreadcrumb>
        <span className="shrink-0 text-muted-foreground text-xs" aria-live="polite">
          {summary}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={sortKey}
          onValueChange={(v) => {
            if (isSortKey(v)) {
              onSortChange(v);
            }
          }}
        >
          <SelectTrigger size="sm" className="w-40 gap-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-1.5">
                  {opt.icon}
                  {t(opt.labelKey)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/*
          New folder + Upload form one segmented control. FileUpload wraps the
          group so its trigger (the Upload button) can reach the picker context;
          the hidden <input> renders alongside the group but stays out of flow.
        */}
        <FileUpload multiple onFilesSelected={onUpload}>
          <ButtonGroup aria-label={t('fileBrowser.toolbar.actionsLabel')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewFolder}
              disabled={newFolderDisabled}
              className="gap-1.5"
            >
              <FolderPlus className="size-3.5" />
              <span className="hidden sm:inline">{t('fileBrowser.toolbar.newFolder')}</span>
            </Button>
            <FileUploadTrigger asChild>
              <Button variant="default" size="sm" className="gap-1.5">
                <Upload className="size-3.5" />
                <span className="hidden sm:inline">{t('fileBrowser.toolbar.upload')}</span>
              </Button>
            </FileUploadTrigger>
          </ButtonGroup>
        </FileUpload>
      </div>
    </div>
  );
}
