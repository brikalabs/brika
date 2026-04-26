/**
 * Per-field renderers for the brick configuration sheet. Dispatches on
 * `field.type` (text / password / number / checkbox / dropdown /
 * dynamic-dropdown) to the right widget.
 */

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@brika/clay';
import type { PreferenceDefinition } from '@brika/plugin';
import { RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { brickTypesApi } from '@/features/boards/api';
import { useLocale } from '@/lib/use-locale';
import type { Json } from '@/types';

/** Extract the default value from any preference variant (not all have one). */
function getDefault(field: PreferenceDefinition): unknown {
  if ('default' in field) {
    return field.default;
  }
  return undefined;
}

function toStr(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export interface FieldProps {
  field: PreferenceDefinition;
  value: Json;
  onChange: (name: string, value: Json) => void;
  pluginName: string;
  brickLocalId: string;
  brickTypeId: string;
}

function TextField({ field, value, onChange }: Readonly<FieldProps>) {
  return (
    <Input
      id={field.name}
      type={field.type === 'password' ? 'password' : 'text'}
      value={toStr(value ?? getDefault(field))}
      onChange={(e) => onChange(field.name, e.target.value)}
    />
  );
}

function NumberField({ field, value, onChange }: Readonly<FieldProps>) {
  if (field.type !== 'number') {
    return null;
  }
  return (
    <Input
      id={field.name}
      type="number"
      min={field.min}
      max={field.max}
      step={field.step}
      value={toStr(value ?? getDefault(field))}
      onChange={(e) => onChange(field.name, Number(e.target.value))}
    />
  );
}

function CheckboxField({ field, value, onChange }: Readonly<FieldProps>) {
  const checked = Boolean(value ?? getDefault(field) ?? false);
  return (
    <Switch id={field.name} checked={checked} onCheckedChange={(v) => onChange(field.name, v)} />
  );
}

function DropdownField({
  field,
  value,
  onChange,
  pluginName,
  brickLocalId,
  brickTypeId,
}: Readonly<FieldProps>) {
  const { tp } = useLocale();
  const isDynamic = field.type === 'dynamic-dropdown';

  const [dynamicOptions, setDynamicOptions] = useState<Array<{ value: string; label?: string }>>(
    isDynamic ? (field.options ?? []) : []
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await brickTypesApi.getConfigOptions(brickTypeId, field.name);
      setDynamicOptions(data.options);
    } finally {
      setIsRefreshing(false);
    }
  }, [brickTypeId, field.name]);

  if (field.type !== 'dropdown' && !isDynamic) {
    return null;
  }

  const options = isDynamic ? dynamicOptions : field.options;
  const optionLabel = (opt: { value: string; label?: string }) =>
    opt.label ??
    tp(pluginName, `bricks.${brickLocalId}.config.${field.name}.options.${opt.value}`, opt.value);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={toStr(value ?? getDefault(field))}
        onValueChange={(v) => onChange(field.name, v)}
      >
        <SelectTrigger id={field.name} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {optionLabel(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isDynamic && (
        <Button variant="ghost" size="icon" onClick={refresh} disabled={isRefreshing}>
          <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      )}
    </div>
  );
}

export function ConfigField(props: Readonly<FieldProps>) {
  switch (props.field.type) {
    case 'dropdown':
    case 'dynamic-dropdown':
      return <DropdownField {...props} />;
    case 'number':
      return <NumberField {...props} />;
    case 'checkbox':
      return <CheckboxField {...props} />;
    case 'text':
    case 'password':
      return <TextField {...props} />;
  }
}
