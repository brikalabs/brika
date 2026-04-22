/**
 * FontField — a dropdown of curated font choices plus a freeform
 * text input for arbitrary CSS font-family stacks. The preview line
 * below renders in the selected stack so the user can see it.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { FontChoice } from '../tokens';

interface FontFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  choices: FontChoice[];
  /** Text rendered in the sample line under the input. */
  sample: string;
}

const CUSTOM_VALUE = '__custom__';

export function FontField({ label, value, onChange, choices, sample }: Readonly<FontFieldProps>) {
  const matched = choices.find((c) => c.stack === value);
  const selectValue = matched ? matched.stack : CUSTOM_VALUE;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === CUSTOM_VALUE) {
              return;
            }
            onChange(v);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.label} value={c.stack}>
                <span style={{ fontFamily: c.stack }}>{c.label}</span>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_VALUE}>Custom…</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="flex-1 rounded-md border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div
        className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
        style={{ fontFamily: value }}
      >
        {sample}
      </div>
    </div>
  );
}
