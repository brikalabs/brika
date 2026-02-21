import type { Command } from '../command';

export default {
  name: 'uninstall',
  description: 'Remove Brika from this machine',
  details: 'Uninstalls Brika and cleans up all associated files.',
  examples: ['brika uninstall'],
  async handler() {
    const { selfUninstall } = await import('@/uninstaller');
    await selfUninstall();
  },
} satisfies Command;
