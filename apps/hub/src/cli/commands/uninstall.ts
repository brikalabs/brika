import type { Command } from '../command';

export default {
  name: 'uninstall',
  description: 'Remove Brika from this machine',
  details:
    'Uninstalls Brika and cleans up all associated files.\nUse --purge to also delete the .brika workspace directory (config, plugins, logs).',
  options: {
    purge: {
      type: 'boolean',
      description: 'Also remove the .brika workspace directory and all its data',
    },
  },
  examples: ['brika uninstall', 'brika uninstall --purge'],
  async handler({ values }) {
    const { selfUninstall } = await import('@/uninstaller');
    await selfUninstall({ purge: !!values.purge });
  },
} satisfies Command;
