import { defineCommand } from '../command';

export default defineCommand({
  name: 'update',
  description: 'Update to the latest version',
  details: 'Checks for newer versions and updates Brika if available.',
  examples: ['brika update', 'brika update --force', 'brika update --channel canary'],
  options: {
    force: {
      type: 'boolean',
      short: 'f',
      description: 'Force reinstall even if already up to date',
    },
    channel: {
      type: 'string',
      description: 'Override the update channel for this run (stable, canary)',
    },
  },
  async handler({ values }) {
    const { selfUpdate } = await import('@/updater');
    const { resolveChannel } = await import('@/runtime/updates/channels');
    await selfUpdate({
      force: values.force,
      channel: values.channel === undefined ? undefined : resolveChannel(values.channel).id,
    });
  },
});
