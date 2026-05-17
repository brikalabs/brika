import { Input } from '@brika/tui';
import type React from 'react';
import { useState } from 'react';
import type { PluginListItem } from '../../../../shared/cli/api/plugins';

export function filterPlugins(
  items: ReadonlyArray<PluginListItem>,
  filter: string
): PluginListItem[] {
  const q = filter.trim().toLowerCase();
  if (q.length === 0) {
    return [...items];
  }
  return items.filter((p) => {
    const hay = `${p.name} ${p.displayName ?? ''} ${p.description ?? ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Thin wrapper around `<Input>` for the `/`-driven list filter:
 *  keeps a draft buffer locally so Enter commits and Esc cancels. The
 *  `<Input>` chrome speaks for itself — the focused border + cursor
 *  are enough discoverability for "Enter to commit, Esc to cancel". */
export function FilterDraft({
  initial,
  onCommit,
  onCancel,
}: Readonly<{
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}>): React.ReactElement {
  const [draft, setDraft] = useState(initial);
  return (
    <Input
      type="search"
      value={draft}
      onChange={setDraft}
      onSubmit={onCommit}
      onCancel={onCancel}
      placeholder="filter plugins… (Enter to apply, Esc to cancel)"
    />
  );
}
