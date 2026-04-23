/**
 * MetaHeader — slim name / description inputs at the top of the
 * controls panel. Kept frameless on purpose so it reads like a title.
 */

import type { ThemeConfig } from '../types';

interface MetaHeaderProps {
  draft: ThemeConfig;
  onChange: (key: 'name' | 'description' | 'author', value: string) => void;
}

export function MetaHeader({ draft, onChange }: Readonly<MetaHeaderProps>) {
  return (
    <div className="shrink-0 space-y-1 border-b px-3 py-2.5">
      <input
        type="text"
        value={draft.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="Theme name"
        className="w-full bg-transparent font-semibold text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <input
        type="text"
        value={draft.description ?? ''}
        onChange={(e) => onChange('description', e.target.value)}
        placeholder="Short description (optional)"
        className="w-full bg-transparent text-[11px] text-muted-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
