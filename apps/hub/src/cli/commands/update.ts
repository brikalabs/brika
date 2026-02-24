import { defineCommand } from '../command';

export default defineCommand({
  name: 'update',
  description: 'Update to the latest version',
  details: 'Checks for newer versions and updates Brika if available.',
  examples: ['brika update', 'brika update --force'],
  options: {
    force: {
      type: 'boolean',
      short: 'f',
      description: 'Force reinstall even if already up to date',
    },
  },
  async handler({ values }) {
    const { selfUpdate } = await import('@/updater');
    await selfUpdate({ force: values.force });
  },
});
