import pc from 'picocolors';
import { defineCommand } from '../command';

export default defineCommand({
  name: 'channel',
  description: 'Get or set the update channel',
  details: 'Without an argument, shows the current channel and all available channels.',
  examples: ['brika channel', 'brika channel stable', 'brika channel canary'],
  async handler({ positionals }) {
    const { join } = await import('node:path');
    const { UPDATE_CHANNELS, DEFAULT_CHANNEL_ID, resolveChannel } = await import(
      '@/runtime/updates/channels'
    );

    const home = process.env.BRIKA_HOME ?? join(process.cwd(), '.brika');
    const stateFile = Bun.file(`${home}/state.json`);

    async function readChannel(): Promise<string> {
      try {
        if (!(await stateFile.exists())) {
          return DEFAULT_CHANNEL_ID;
        }
        const parsed = JSON.parse(await stateFile.text()) as { updateChannel?: string };
        return resolveChannel(parsed.updateChannel).id;
      } catch {
        return DEFAULT_CHANNEL_ID;
      }
    }

    async function writeChannel(id: string): Promise<void> {
      let current: Record<string, unknown> = {};
      try {
        if (await stateFile.exists()) {
          current = JSON.parse(await stateFile.text()) as Record<string, unknown>;
        }
      } catch {
        // start fresh if unreadable
      }
      current.updateChannel = id;
      await Bun.write(stateFile, JSON.stringify(current, null, 2));
    }

    const arg = positionals[0];

    if (!arg) {
      const current = await readChannel();
      console.log('');
      for (const c of UPDATE_CHANNELS) {
        const active = c.id === current;
        const marker = active ? pc.green('●') : pc.dim('○');
        const label = active ? pc.bold(c.label) : c.label;
        console.log(`  ${marker}  ${label}  ${pc.dim(c.description)}`);
      }
      console.log('');
      return;
    }

    const target = UPDATE_CHANNELS.find((c) => c.id === arg);
    if (!target) {
      const ids = UPDATE_CHANNELS.map((c) => c.id).join(', ');
      throw new Error(`Unknown channel "${arg}". Valid channels: ${ids}`);
    }

    await writeChannel(target.id);
    console.log(`Update channel set to ${pc.cyan(target.id)}`);
  },
});
