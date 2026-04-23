/**
 * FontField — compact font picker with a curated dropdown + freeform
 * text input. The preview line below renders in the selected stack so
 * users see the typeface without leaving the panel.
 */

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { FontChoice } from '../tokens';

interface FontFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  choices: FontChoice[];
  sample: string;
}

const CUSTOM_VALUE = '__custom__';

export function FontField({ label, value, onChange, choices, sample }: Readonly<FontFieldProps>) {
  const matched = choices.find((c) => c.stack === value);
  const selectValue = matched ? matched.stack : CUSTOM_VALUE;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium text-xs">{label}</span>
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === CUSTOM_VALUE) {
            return;
          }
          onChange(v);
        }}
      >
        <SelectTrigger className="h-8 w-full text-xs">
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
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="h-auto px-2 py-1 font-mono text-[10px]"
      />
      <div
        className="truncate rounded-md bg-muted/30 px-2 py-1.5 text-xs"
        style={{ fontFamily: value }}
      >
        {sample}
      </div>
    </div>
  );
}
