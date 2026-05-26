import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@brika/sdk/ui-kit';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  Clock,
} from '@brika/sdk/ui-kit/icons';
import type { SortKey } from '../types';

interface SortOption {
  value: SortKey;
  label: string;
  icon: React.ReactNode;
}

const SORT_OPTIONS: SortOption[] = [
  { value: 'name-asc', label: 'Name (A → Z)', icon: <ArrowDownAZ className="size-3.5" /> },
  { value: 'name-desc', label: 'Name (Z → A)', icon: <ArrowUpAZ className="size-3.5" /> },
  { value: 'newest', label: 'Newest first', icon: <Clock className="size-3.5" /> },
  { value: 'oldest', label: 'Oldest first', icon: <Clock className="size-3.5" /> },
  { value: 'largest', label: 'Largest first', icon: <ArrowDownNarrowWide className="size-3.5" /> },
  { value: 'smallest', label: 'Smallest first', icon: <ArrowUpNarrowWide className="size-3.5" /> },
];

function isSortKey(value: string): value is SortKey {
  return SORT_OPTIONS.some((opt) => opt.value === value);
}

export function SortMenu({
  value,
  onChange,
}: Readonly<{ value: SortKey; onChange: (key: SortKey) => void }>) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (isSortKey(v)) {
          onChange(v);
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
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
