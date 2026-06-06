/**
 * Play block config-panel view.
 *
 * Owns the whole editor config UI for the Spotify Play block: a context URI
 * field (playlist / album / track) and a dynamic device picker backed by the
 * `listDevices` server action. Leaving the device empty falls back to the
 * plugin's default device.
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
import { useAction } from '@brika/sdk/ui-kit/hooks';
import { Link2, ListMusic, RefreshCw, Speaker, X } from 'lucide-react';
import { listDevices } from '../actions';

interface PlayConfig {
  contextUri?: string;
  deviceId?: string;
}

export default function PlayView() {
  const config = useBlockConfig<PlayConfig>();
  const update = useUpdateBlockConfig();
  const { data: devices, loading, refetch } = useAction(listDevices);

  const deviceId = config.deviceId ?? '';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[#1DB954]">
        <ListMusic className="size-4" />
        <span className="font-medium text-foreground text-sm">Play on Spotify</span>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Link2 className="size-3.5" />
          Context URI
        </Label>
        <Input
          value={config.contextUri ?? ''}
          onChange={(e) => update({ contextUri: e.target.value })}
          placeholder="spotify:playlist:... or https://open.spotify.com/..."
          className="bg-background font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs">
          Playlist, album, or track. Leave empty to resume the last played track.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-xs">
            <Speaker className="size-3.5" />
            Device
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-muted-foreground text-xs"
            onClick={() => refetch()}
            disabled={loading}
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={deviceId} onValueChange={(v) => update({ deviceId: v })}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={loading ? 'Loading devices...' : 'Plugin default device'} />
            </SelectTrigger>
            <SelectContent>
              {(devices ?? []).map((device) => (
                <SelectItem key={device.value} value={device.value}>
                  <span className="flex items-center gap-2">
                    <Speaker className="size-3.5 text-[#1DB954]" />
                    {device.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deviceId && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground"
              onClick={() => update({ deviceId: '' })}
              aria-label="Use default device"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {!loading && (devices ?? []).length === 0 && (
          <p className="text-muted-foreground text-xs">
            No active devices found. Open Spotify on a device, then refresh.
          </p>
        )}
      </div>
    </div>
  );
}
