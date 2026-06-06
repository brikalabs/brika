/**
 * Condition block config view.
 *
 * A visual rule builder: pick a field, an operator, and a comparison value.
 * Replaces the generic schema form with a clearer, purpose-built UI that owns
 * the whole panel.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/sdk/ui-kit';
import { GitBranch } from 'lucide-react';

interface ConditionConfig {
  field?: string;
  operator?: string;
  value?: unknown;
}

const OPERATORS: Array<{ value: string; label: string; needsValue: boolean }> = [
  { value: 'eq', label: 'equals', needsValue: true },
  { value: 'neq', label: 'not equals', needsValue: true },
  { value: 'gt', label: 'greater than', needsValue: true },
  { value: 'gte', label: 'greater or equal', needsValue: true },
  { value: 'lt', label: 'less than', needsValue: true },
  { value: 'lte', label: 'less or equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'exists', label: 'exists', needsValue: false },
];

function toText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export default function ConditionView() {
  const config = useBlockConfig<ConditionConfig>();
  const update = useUpdateBlockConfig();
  const operator = config.operator ?? 'eq';
  const needsValue = OPERATORS.find((o) => o.value === operator)?.needsValue ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-500">
        <GitBranch className="size-4" />
        <span className="font-medium text-foreground text-sm">When</span>
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

      <div className="space-y-1.5">
        <Label className="text-xs">Operator</Label>
        <Select value={operator} onValueChange={(v) => update({ operator: v })}>
          <SelectTrigger className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsValue && (
        <div className="space-y-1.5">
          <Label className="text-xs">Value</Label>
          <Input
            value={toText(config.value)}
            onChange={(e) => update({ value: e.target.value })}
            placeholder="Comparison value"
            className="bg-background font-mono"
          />
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Matching values flow out of <span className="font-medium text-foreground">Then</span>, the
        rest out of <span className="font-medium text-foreground">Else</span>.
      </p>
    </div>
  );
}
