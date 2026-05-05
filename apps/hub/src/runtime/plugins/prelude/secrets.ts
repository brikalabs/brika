/**
 * Prelude Secrets Module
 *
 * Forwards SDK secret API calls over IPC. The hub identifies the plugin from
 * the channel itself (not from anything we send), so a plugin can never reach
 * another plugin's secrets through these RPCs.
 */

import type { Channel } from '@brika/ipc';
import { deletePluginSecret, getPluginSecret, setPluginSecret } from '@brika/ipc/contract';

export function setupSecrets(channel: Channel) {
  return {
    async getSecret(key: string): Promise<string | null> {
      const result = await channel.call(getPluginSecret, { key });
      return result.value;
    },
    async setSecret(key: string, value: string): Promise<void> {
      await channel.call(setPluginSecret, { key, value });
    },
    async deleteSecret(key: string): Promise<boolean> {
      const result = await channel.call(deletePluginSecret, { key });
      return result.deleted;
    },
  };
}
