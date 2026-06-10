/**
 * "When Device Changes" block config view.
 *
 * Pick a device, then choose which attributes to watch. Each watched attribute
 * becomes its own output port on the node (dynamic templated ports), so a
 * workflow can branch per attribute. Every watched attribute can carry a
 * built-in condition: fire on any change, when the value becomes a target, or
 * when it crosses above/below a numeric threshold (edge-triggered).
 *
 * The attribute vocabulary comes from the shared registry in attributes.ts
 * (zod-free, browser-safe), so the dropdown always matches what the cluster
 * readers actually produce. Suggestions adapt to the device type.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/sdk/ui-kit';
import { useAction, useLocale } from '@brika/sdk/ui-kit/hooks';
import { Cpu, Plus, Radio, RefreshCw, Trash2 } from 'lucide-react';
import { listDevices } from '../actions';
import { ATTRIBUTE_BY_KEY, WATCHABLE_ATTRIBUTE_KEYS } from '../attributes';
import { DEVICE_ICONS } from './_command-meta';
import { ATTRIBUTE_CONDITION_VALUES, type AttributeConditionKind } from './attribute-condition';

interface WatchedAttribute {
  name: string;
  when?: string;
  value?: string;
}

interface DeviceEventConfig {
  nodeId?: string;
  attributes?: WatchedAttribute[];
}

/** Display labels per condition; the values come from the shared tuple. */
const CONDITION_LABELS: Record<AttributeConditionKind, string> = {
  changes: 'changes',
  becomes: 'becomes',
  above: 'goes above',
  below: 'goes below',
};

const CONDITION_OPTIONS: readonly { value: string; label: string }[] =
  ATTRIBUTE_CONDITION_VALUES.map((value) => ({ value, label: CONDITION_LABELS[value] }));

/** Common attributes to suggest, per device type (real registry keys). */
const ATTRIBUTE_SUGGESTIONS: Record<string, string[]> = {
  light: ['on', 'brightness', 'colorTempMireds'],
  switch: ['lastPress', 'battery'],
  lock: ['locked'],
  cover: ['coverPosition'],
  thermostat: ['temperature', 'systemModeName'],
  sensor: ['occupied', 'contact', 'temperature', 'humidity', 'illuminance'],
  fan: ['fanSpeed', 'fanMode'],
  vacuum: ['vacuumState', 'battery'],
  bridge: [],
  unknown: ['on'],
};

function attributeLabel(key: string, t: (k: string) => string): string {
  const meta = ATTRIBUTE_BY_KEY[key];
  return meta ? t(meta.labelKey) : key;
}

function WatchedAttributeRow({
  attr,
  onChange,
  onRemove,
}: Readonly<{
  attr: WatchedAttribute;
  onChange: (patch: Partial<WatchedAttribute>) => void;
  onRemove: () => void;
}>) {
  const when = attr.when ?? 'changes';
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-mono text-sm">{attr.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-destructive"
          onClick={onRemove}
          aria-label={`Stop watching ${attr.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <Select value={when} onValueChange={(v: string) => onChange({ when: v })}>
          <SelectTrigger className="h-8 flex-1 bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {when !== 'changes' && (
          <Input
            value={attr.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={when === 'becomes' ? 'value' : 'number'}
            className="h-8 flex-1 bg-background font-mono text-xs"
          />
        )}
      </div>
    </div>
  );
}

export default function DeviceEventView() {
  const { t } = useLocale();
  const config = useBlockConfig<DeviceEventConfig>();
  const update = useUpdateBlockConfig();
  const { data: devices, loading, refetch } = useAction(listDevices);

  const attributes = config.attributes ?? [];
  const selected = devices?.find((d) => d.value === config.nodeId);
  const DeviceIcon = selected ? (DEVICE_ICONS[selected.deviceType] ?? Cpu) : Cpu;
  const suggestions = (selected ? ATTRIBUTE_SUGGESTIONS[selected.deviceType] : undefined) ?? [];

  const hasAttr = (name: string) => attributes.some((a) => a.name === name);
  const addAttr = (name: string) => {
    if (name && !hasAttr(name)) {
      update({ attributes: [...attributes, { name, when: 'changes' }] });
    }
  };
  const patchAttr = (index: number, patch: Partial<WatchedAttribute>) =>
    update({
      attributes: attributes.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    });
  const removeAttr = (index: number) =>
    update({ attributes: attributes.filter((_, i) => i !== index) });

  const available = WATCHABLE_ATTRIBUTE_KEYS.filter((key) => !hasAttr(key));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-indigo-500">
        <Radio className="size-4" />
        <span className="font-medium text-foreground text-sm">When this device changes</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Device</Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={() => refetch()}
            aria-label="Refresh devices"
          >
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
        </div>
        <Select value={config.nodeId ?? ''} onValueChange={(v) => update({ nodeId: v })}>
          <SelectTrigger className="bg-background">
            <SelectValue
              placeholder={loading ? t('device.loadingDevices') : t('device.selectDevice')}
            >
              {selected && (
                <span className="flex items-center gap-2">
                  <DeviceIcon className="size-4 text-indigo-500" />
                  <span>{selected.label}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(devices ?? []).map((device) => {
              const Icon = DEVICE_ICONS[device.deviceType] ?? Cpu;
              return (
                <SelectItem key={device.value} value={device.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-indigo-500" />
                    <span className="flex-1">{device.label}</span>
                    <span className="text-muted-foreground text-xs capitalize">
                      {device.deviceType}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Watched attributes</Label>

        {attributes.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
            Add an attribute to create an output. The "Any change" output always fires.
          </p>
        )}

        {attributes.map((attr, index) => (
          <WatchedAttributeRow
            key={attr.name}
            attr={attr}
            onChange={(patch) => patchAttr(index, patch)}
            onRemove={() => removeAttr(index)}
          />
        ))}

        {suggestions.some((s) => !hasAttr(s)) && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions
              .filter((s) => !hasAttr(s))
              .map((s) => (
                <Button
                  type="button"
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => addAttr(s)}
                >
                  <Plus className="size-3" />
                  {s}
                </Button>
              ))}
          </div>
        )}

        {available.length > 0 && (
          <Select value="" onValueChange={(v: string) => addAttr(v)}>
            <SelectTrigger className="bg-background text-muted-foreground text-xs">
              <SelectValue placeholder="Add attribute..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((key) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-baseline gap-2">
                    <span>{attributeLabel(key, t)}</span>
                    <span className="font-mono text-muted-foreground text-xs">{key}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Fires in real time from Matter device events. Each attribute routes out its own port;
        "becomes" and threshold conditions fire only when the condition newly holds.
      </p>
    </div>
  );
}
