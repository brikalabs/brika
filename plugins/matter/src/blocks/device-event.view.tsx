/**
 * "When Device Changes" block config view.
 *
 * Pick a device, then choose which attributes to watch. Each watched attribute
 * becomes its own output port on the node (dynamic templated ports), so a
 * workflow can branch per attribute. Suggestions adapt to the device type.
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
import { Cpu, Plus, Radio, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { listDevices } from '../actions';
import { DEVICE_ICONS } from './_command-meta';

interface WatchedAttribute {
  name: string;
}

interface DeviceEventConfig {
  nodeId?: string;
  attributes?: WatchedAttribute[];
}

/** Common attributes to suggest, per device type. Users can add their own. */
const ATTRIBUTE_SUGGESTIONS: Record<string, string[]> = {
  light: ['on', 'level', 'colorTemp'],
  switch: ['on'],
  lock: ['lockState'],
  cover: ['position'],
  thermostat: ['temperature', 'targetTemp'],
  sensor: ['occupancy', 'contact', 'temperature', 'humidity', 'illuminance'],
  bridge: ['on'],
  unknown: ['on'],
};

export default function DeviceEventView() {
  const { t } = useLocale();
  const config = useBlockConfig<DeviceEventConfig>();
  const update = useUpdateBlockConfig();
  const { data: devices, loading, refetch } = useAction(listDevices);
  const [custom, setCustom] = useState('');

  const attributes = config.attributes ?? [];
  const selected = devices?.find((d) => d.value === config.nodeId);
  const DeviceIcon = selected ? (DEVICE_ICONS[selected.deviceType] ?? Cpu) : Cpu;
  const suggestions = (selected ? ATTRIBUTE_SUGGESTIONS[selected.deviceType] : undefined) ?? [];

  const hasAttr = (name: string) => attributes.some((a) => a.name === name);
  const addAttr = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !hasAttr(trimmed)) {
      update({ attributes: [...attributes, { name: trimmed }] });
    }
  };
  const removeAttr = (name: string) =>
    update({ attributes: attributes.filter((a) => a.name !== name) });

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

        {attributes.map((attr) => (
          <div key={attr.name} className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-sm">
              {attr.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => removeAttr(attr.name)}
              aria-label={`Stop watching ${attr.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
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

        <div className="flex items-center gap-1.5">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addAttr(custom);
                setCustom('');
              }
            }}
            placeholder="Custom attribute name"
            className="bg-background font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => {
              addAttr(custom);
              setCustom('');
            }}
            aria-label="Add attribute"
          >
            <X className="size-4 rotate-45" />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Fires in real time from Matter device events. Each attribute routes out its own port.
      </p>
    </div>
  );
}
