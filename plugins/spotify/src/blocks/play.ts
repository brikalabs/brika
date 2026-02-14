import { defineReactiveBlock, input, log, output, z } from '@brika/sdk';
import { getApi, resolveDevice, toSpotifyUri } from '../shared';

export const playBlock = defineReactiveBlock(
  {
    id: 'play',
    name: 'Play Spotify',
    description: 'Start playback on a Spotify device',
    category: 'action',
    icon: 'play',
    color: '#1DB954',
    inputs: {
      trigger: input(z.generic(), { name: 'Trigger' }),
    },
    outputs: {
      started: output(z.object({ deviceId: z.string(), contextUri: z.string().optional() }), { name: 'Started' }),
      error: output(z.object({ message: z.string() }), { name: 'Error' }),
    },
    config: z.object({
      contextUri: z.string().optional().describe('Spotify URI or URL (playlist, album, or track). Empty = resume last played'),
      deviceId: z.string().optional().describe('Device name or ID. Empty = use plugin default device'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      try {
        const deviceId = await resolveDevice(config.deviceId);
        const contextUri = toSpotifyUri(config.contextUri);
        const uri = contextUri ?? await getApi().getRecentlyPlayed() ?? undefined;

        if (deviceId) await getApi().transferPlayback(deviceId);
        await getApi().play(deviceId, uri);

        const target = deviceId ? ` on ${deviceId}` : '';
        log.info(`Spotify playback started${target}`);
        outputs.started.emit({ deviceId: deviceId ?? '', contextUri: uri });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Spotify play failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
);
