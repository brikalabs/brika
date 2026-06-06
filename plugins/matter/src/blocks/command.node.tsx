/**
 * Matter Command block node-body view.
 *
 * Renders a compact summary on the workflow canvas: the chosen command (with a
 * matching icon) and the target device's name, resolved live from the Matter
 * controller via the `listDevices` action. Falls back to placeholders when the
 * block is not yet configured.
 */

import { useBlockConfig } from '@brika/sdk/block-views';
import { useAction } from '@brika/sdk/ui-kit/hooks';
import { Cpu, Lightbulb } from 'lucide-react';
import { listDevices } from '../actions';
import { COMMAND_META, type CommandConfig, DEVICE_ICONS } from './_command-meta';

export default function CommandNode() {
  const config = useBlockConfig<CommandConfig>();
  const { data: devices } = useAction(listDevices);

  const command = config.command ? COMMAND_META[config.command] : undefined;
  const CommandIcon = command?.icon ?? Lightbulb;
  const device = devices?.find((d) => d.value === config.nodeId);
  const DeviceIcon = device ? (DEVICE_ICONS[device.deviceType] ?? Cpu) : Cpu;

  if (!config.nodeId && !config.command) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-muted-foreground">
        <Cpu className="size-4" />
        <span className="text-xs">Pick a device and command</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500">
          <CommandIcon className="size-4" />
        </div>
        <span className="font-medium text-foreground text-sm">
          {command?.label ?? 'Send command'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <DeviceIcon className="size-3.5" />
        <span className="truncate">{device?.label ?? config.nodeId ?? 'No device selected'}</span>
        {device && (
          <span
            className={
              device.online
                ? 'size-1.5 shrink-0 rounded-full bg-emerald-500'
                : 'size-1.5 shrink-0 rounded-full bg-muted-foreground/40'
            }
          />
        )}
      </div>
    </div>
  );
}
