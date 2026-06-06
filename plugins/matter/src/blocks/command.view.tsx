/**
 * Matter Command block config view.
 *
 * Replaces the raw "nodeId string + command enum" schema form with a purpose-built
 * panel: a live device picker (populated from the Matter controller's commissioned
 * devices via the `listDevices` action), a command selector, and parameter controls
 * that appear only for the commands that need them (brightness, color temperature).
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from '@brika/sdk/ui-kit';
import { useAction } from '@brika/sdk/ui-kit/hooks';
import { Cpu, Network, RefreshCw, Sun, Thermometer } from 'lucide-react';
import { listDevices } from '../actions';
import { COMMANDS, type CommandConfig, DEVICE_ICONS } from './_command-meta';

/** Matter level range (0-254) <-> user-facing percent. */
function levelToPercent(level: string | undefined): number {
  if (level === undefined) {
    return 100;
  }
  return Math.round((Number(level) / 254) * 100);
}

function percentToLevel(percent: number): string {
  return String(Math.round((percent / 100) * 254));
}

/** Color temperature is stored in mireds; warmer = higher mireds. */
const MIREDS_MIN = 153;
const MIREDS_MAX = 454;
const MIREDS_DEFAULT = 370;

export default function CommandView() {
  const config = useBlockConfig<CommandConfig>();
  const update = useUpdateBlockConfig();
  const { data: devices, loading, error, refetch } = useAction(listDevices);

  const command = config.command ?? 'on';
  const selectedCommand = COMMANDS.find((c) => c.value === command) ?? COMMANDS[0];
  const selected = devices?.find((d) => d.value === config.nodeId);

  const setParam = (key: string, value: string) => {
    update({ params: { ...config.params, [key]: value } });
  };

  const brightnessPct = levelToPercent(config.params?.level);
  const mireds =
    config.params?.mireds === undefined ? MIREDS_DEFAULT : Number(config.params.mireds);

  const DeviceIcon = selected ? (DEVICE_ICONS[selected.deviceType] ?? Cpu) : Cpu;
  const CommandIcon = selectedCommand.icon;

  return (
    <div className="space-y-4">
      {/* ── Device picker ─────────────────────────────────────────── */}
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

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <Network className="size-4" />
            <span>Could not load devices</span>
          </div>
        )}

        {!error && !loading && (devices?.length ?? 0) === 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
            <Cpu className="size-4" />
            <span>No commissioned devices</span>
          </div>
        )}

        {!error && (devices?.length ?? 0) > 0 && (
          <Select value={config.nodeId ?? ''} onValueChange={(v) => update({ nodeId: v })}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select a device...">
                {selected && (
                  <span className="flex items-center gap-2">
                    <DeviceIcon className="size-4 text-indigo-500" />
                    <span>{selected.label}</span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {devices?.map((device) => {
                const Icon = DEVICE_ICONS[device.deviceType] ?? Cpu;
                return (
                  <SelectItem key={device.value} value={device.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-indigo-500" />
                      <span className="flex-1">{device.label}</span>
                      <span
                        className={
                          device.online
                            ? 'size-2 rounded-full bg-emerald-500'
                            : 'size-2 rounded-full bg-muted-foreground/40'
                        }
                      />
                      <span className="text-muted-foreground text-xs capitalize">
                        {device.deviceType}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Command picker ────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs">Command</Label>
        <Select value={command} onValueChange={(v) => update({ command: v })}>
          <SelectTrigger className="bg-background">
            <SelectValue>
              <span className="flex items-center gap-2">
                <CommandIcon className="size-4 text-indigo-500" />
                <span>{selectedCommand.label}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COMMANDS.map((c) => {
              const Icon = c.icon;
              return (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-indigo-500" />
                    <span>{c.label}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* ── Conditional params ────────────────────────────────────── */}
      {command === 'setBrightness' && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs">
              <Sun className="size-3.5 text-amber-500" />
              Brightness
            </Label>
            <Badge variant="secondary" className="tabular-nums">
              {brightnessPct}%
            </Badge>
          </div>
          <Slider
            value={brightnessPct}
            onChange={(v) => setParam('level', percentToLevel(v))}
            min={0}
            max={100}
            step={1}
          />
        </div>
      )}

      {command === 'setColorTemp' && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs">
              <Thermometer className="size-3.5 text-amber-500" />
              Color temperature
            </Label>
            <Badge variant="secondary" className="tabular-nums">
              {mireds} mireds
            </Badge>
          </div>
          <Slider
            value={mireds}
            onChange={(v) => setParam('mireds', String(v))}
            min={MIREDS_MIN}
            max={MIREDS_MAX}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Cool</span>
            <span>Warm</span>
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Runs when an event reaches the block's <span className="font-medium">Trigger</span> input.
      </p>
    </div>
  );
}
