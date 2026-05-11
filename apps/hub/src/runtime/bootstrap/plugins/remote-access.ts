/**
 * Remote Access Bootstrap Plugin
 *
 * Boots the WebRTC remote-access service after the API server is listening.
 * No-op when `BRIKA_REMOTE_ACCESS` is unset — adds no startup cost for hubs
 * that only run on the local network.
 */

import { inject } from '@brika/di';
import { RemoteAccessService } from '@/runtime/remote-access';
import type { BootstrapPlugin } from '../plugin';

export function remoteAccess(): BootstrapPlugin {
  return {
    name: 'remote-access',

    async onStart() {
      await inject(RemoteAccessService).start();
    },

    onStop() {
      inject(RemoteAccessService).stop();
    },
  };
}
