import pc from 'picocolors';
import { defineCommand } from '../command';
import { hubUrl, requireRunningHub } from '../utils/hub-client';
import { openBrowser } from '../utils/open';

export default defineCommand({
  name: 'open',
  description: 'Open the Brika UI in the default browser',
  examples: [
    'brika open',
  ],
  async handler() {
    await requireRunningHub();
    const url = hubUrl();
    console.log(`${pc.cyan('Opening')} ${pc.dim(url)}`);
    openBrowser(url);
  },
});
