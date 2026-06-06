/**
 * Switch block config view.
 *
 * Lets the user pick a field and add/remove an arbitrary number of match cases.
 * Each case adds its own output port on the node (the `case` output is a dynamic
 * template, see the block's `repeat: 'cases'` output). The last branch is the
 * built-in Default output.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import { Button, Input, Label } from '@brika/sdk/ui-kit';
import { GitFork, Plus, Trash2 } from 'lucide-react';

interface SwitchCase {
  value: string;
  /** Stable id for React keys; cases are an editable positional list. */
  id: string;
}

interface SwitchConfig {
  field?: string;
  cases?: SwitchCase[];
}

export default function SwitchView() {
  const config = useBlockConfig<SwitchConfig>();
  const update = useUpdateBlockConfig();
  const cases = config.cases ?? [];

  const setCases = (next: SwitchCase[]) => update({ cases: next });
  const addCase = () => setCases([...cases, { value: '', id: crypto.randomUUID() }]);
  const removeCase = (index: number) => setCases(cases.filter((_, i) => i !== index));
  const setCaseValue = (index: number, value: string) =>
    setCases(cases.map((c, i) => (i === index ? { ...c, value } : c)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-violet-500">
        <GitFork className="size-4" />
        <span className="font-medium text-foreground text-sm">Switch on</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Field</Label>
        <Input
          value={config.field ?? ''}
          onChange={(e) => update({ field: e.target.value })}
          placeholder="value, data.status, ..."
          className="bg-background font-mono"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Cases</Label>
        {cases.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
            No cases yet. Add one to create a matching output.
          </p>
        )}
        {cases.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="w-14 shrink-0 font-mono text-muted-foreground text-xs">
              case {i + 1}
            </span>
            <Input
              value={c.value}
              onChange={(e) => setCaseValue(i, e.target.value)}
              placeholder="equals value"
              className="flex-1 bg-background font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => removeCase(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addCase}>
          <Plus className="mr-1 size-4" />
          Add case
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        The input flows out of the first matching case, or out of{' '}
        <span className="font-medium text-foreground">Default</span> when nothing matches.
      </p>
    </div>
  );
}
