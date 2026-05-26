import { describeFile } from '../lib/file-kind';
import type { FsEntry } from '../types';

export function EntryIcon({ entry }: Readonly<{ entry: FsEntry }>) {
  const { Icon, fg, bg } = describeFile(entry.name, entry.isDirectory);
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${bg}`}
      aria-hidden
    >
      <Icon className={`size-4 ${fg}`} />
    </span>
  );
}
