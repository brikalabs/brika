import type { Command } from '../command';

export default {
  name: 'update',
  description: 'Update to the latest version',
  details: 'Checks for newer versions and updates Brika if available.',
  examples: ['brika update'],
  async handler() {
    const { selfUpdate } = await import('@/updater');
    await selfUpdate();
  },
} satisfies Command;
