import { describeFile } from '../../lib/file-kind';
import { formatRelativeTime, formatSize } from '../../lib/format';
import { extOf } from '../../lib/path';
import type { PreviewMeta } from '../../types';
import { MetaRow } from './MetaRow';

export function MetadataBlock({ name, meta }: Readonly<{ name: string; meta: PreviewMeta }>) {
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
