import pc from 'picocolors';
import type { Command } from '../command';
import { hubUrl, requireRunningHub } from '../utils/hub-client';
import { openBrowser } from '../utils/open';

export default {
  name: 'open',
  description: 'Open the Brika UI in the default browser',
  options: {
    port: { type: 'string', short: 'p', description: 'Hub port (default: 3001)' },
  },
  examples: ['brika open', 'brika open -p 8080'],
  async handler({ values }) {
    await requireRunningHub();
    const port = typeof values.port === 'string' ? Number(values.port) : undefined;
    const url = hubUrl(port);
    console.log(`${pc.cyan('Opening')} ${pc.dim(url)}`);
    openBrowser(url);
  },
} satisfies Command;
