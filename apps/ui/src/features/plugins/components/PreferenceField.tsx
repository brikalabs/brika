import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@brika/clay';
import type {
  CheckboxPreference,
  DropdownPreference,
  LinkPreference,
  NumberPreference,
  PasswordPreference,
  PreferenceDefinition,
  TextPreference,
} from '@brika/plugin';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { pluginsApi } from '../api';

interface PreferenceFieldProps {
  pref: PreferenceDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  pluginUid: string;
  pluginName: string;
  tp: (ns: string, key: string, fallback?: string) => string;
}

interface SharedFieldProps {
  label: string;
  description: string;
}

function resolvePluginUrl(url: string, pluginUid: string): string {
  if (url.startsWith('/api/')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `/api/plugins/${encodeURIComponent(pluginUid)}/routes${url}`;
  }
  return url;
}

function FieldDescription({
  description,
}: Readonly<{
  description: string;
}>) {
  if (!description) {
    return null;
  }
  return <p className="text-muted-foreground text-xs">{description}</p>;
}

/* ─── Per-type field components ─────────────────────────────────────────────── */

function TextOrPasswordField({
  pref,
  value,
  onChange,
  label,
  description,
}: Readonly<
  SharedFieldProps & {
    pref: TextPreference | PasswordPreference;
    value: unknown;
    onChange: (value: unknown) => void;
  }
>) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {pref.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        type={pref.type}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={pref.default}
      />
      <FieldDescription description={description} />
    </div>
  );
}

function NumberField({
  pref,
  value,
  onChange,
  label,
  description,
}: Readonly<
  SharedFieldProps & {
    pref: NumberPreference;
    value: unknown;
    onChange: (value: unknown) => void;
  }
>) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {pref.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        type="number"
        value={typeof value === 'number' ? value : (pref.default ?? '')}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        min={pref.min}
        max={pref.max}
        step={pref.step}
      />
      <FieldDescription description={description} />
    </div>
  );
}

function CheckboxField({
  pref,
  value,
  onChange,
  label,
  description,
}: Readonly<
  SharedFieldProps & {
    pref: CheckboxPreference;
    value: unknown;
    onChange: (value: unknown) => void;
  }
>) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label>{label}</Label>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <Switch
        checked={typeof value === 'boolean' ? value : (pref.default ?? false)}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function DropdownField({
  pref,
  value,
  onChange,
  pluginName,
  label,
  description,
  tp,
}: Readonly<
  SharedFieldProps & {
    pref: DropdownPreference;
    value: unknown;
    onChange: (value: unknown) => void;
    pluginName: string;
    tp: (ns: string, key: string, fallback?: string) => string;
  }
>) {
  const options = pref.options ?? [];
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {pref.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Select
        value={typeof value === 'string' ? value : (pref.default ?? '')}
        onValueChange={onChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const optLabel =
              'label' in opt && typeof opt.label === 'string' ? opt.label : opt.value;
            return (
              <SelectItem key={opt.value} value={opt.value}>
                {tp(pluginName, `preferences.${pref.name}.options.${opt.value}`, optLabel)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <FieldDescription description={description} />
    </div>
  );
}

function DynamicDropdown({
  pref,
  value,
  onChange,
  pluginUid,
  label,
  description,
}: Readonly<{
  pref: Extract<
    PreferenceDefinition,
    {
      type: 'dynamic-dropdown';
    }
  >;
  value: unknown;
  onChange: (value: unknown) => void;
  pluginUid: string;
  label: string;
  description: string;
}>) {
  const [options, setOptions] = useState(pref.options ?? []);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await pluginsApi.getPreferenceOptions(pluginUid, pref.name);
      setOptions(data.options);
    } finally {
      setIsRefreshing(false);
    }
  }, [pluginUid, pref.name]);

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {pref.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="flex gap-2">
        <Select
          value={typeof value === 'string' ? value : (pref.default ?? '')}
          onValueChange={onChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={isRefreshing}>
          <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <FieldDescription description={description} />
    </div>
  );
}

function LinkField({
  pref,
  pluginUid,
  label,
  description,
}: Readonly<
  SharedFieldProps & {
    pref: LinkPreference;
    pluginUid: string;
  }
>) {
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => window.open(resolvePluginUrl(pref.url, pluginUid), '_blank', 'noopener')}
      >
        <ExternalLink className="mr-2 size-4" />
        {label}
      </Button>
      <FieldDescription description={description} />
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────────── */

export function PreferenceField({
  pref,
  value,
  onChange,
  pluginUid,
  pluginName,
  tp,
}: Readonly<PreferenceFieldProps>) {
  const label = tp(pluginName, `preferences.${pref.name}.title`, pref.label ?? pref.name);
  const description = tp(
    pluginName,
    `preferences.${pref.name}.description`,
    pref.description ?? ''
  );

  switch (pref.type) {
    case 'text':
    case 'password':
      return (
        <TextOrPasswordField
          pref={pref}
          value={value}
          onChange={onChange}
          label={label}
          description={description}
        />
      );

    case 'number':
      return (
        <NumberField
          pref={pref}
          value={value}
          onChange={onChange}
          label={label}
          description={description}
        />
      );

    case 'checkbox':
      return (
        <CheckboxField
          pref={pref}
          value={value}
          onChange={onChange}
          label={label}
          description={description}
        />
      );

    case 'dropdown':
      return (
        <DropdownField
          pref={pref}
          value={value}
          onChange={onChange}
          pluginName={pluginName}
          label={label}
          description={description}
          tp={tp}
        />
      );

    case 'dynamic-dropdown':
      return (
        <DynamicDropdown
          pref={pref}
          value={value}
          onChange={onChange}
          pluginUid={pluginUid}
          label={label}
          description={description}
        />
      );

    case 'link':
      return (
        <LinkField pref={pref} pluginUid={pluginUid} label={label} description={description} />
      );
  }
}
