import pc from 'picocolors';
import { defineCommand } from '../command';
import { hubUrl } from '../utils/hub-client';
import { openBrowser } from '../utils/open';
import { detect, spawnDetached } from '../utils/runtime';

const uiDir = detect('ui');

export default defineCommand({
  name: 'start',
  description: 'Start the Brika hub',
  details: 'Starts the Brika hub server. Detaches by default; use --foreground to keep attached.',
  options: {
    port: { type: 'string', short: 'p', description: 'Listen port (default: 3001)' },
    host: { type: 'string', description: 'Listen address (default: 127.0.0.1)' },
    foreground: {
      type: 'boolean',
      short: 'f',
      description: 'Keep attached to terminal (default: detach)',
    },
    open: { type: 'boolean', short: 'o', description: 'Open the UI in the default browser' },
  },
  examples: [
    'brika start',
    'brika start --open',
    'brika start -p 8080',
    'brika start --host 0.0.0.0 -p 3000',
    'brika start --foreground',
  ],
  async handler({ values }) {
    // values.port is string | undefined, values.foreground is boolean | undefined
    if (values.port) process.env.BRIKA_PORT = values.port;
    if (values.host) process.env.BRIKA_HOST = values.host;
    process.env.BRIKA_STATIC_DIR ??= uiDir;

    if (values.foreground !== true) {
      const { pid } = spawnDetached(['start', '--foreground']);
      console.log(`${pc.green('Started')} — hub running in background  ${pc.dim('PID ' + pid)}`);
      console.log(pc.dim(`  Stop with: brika stop`));
      if (values.open) openBrowser(hubUrl());
      process.exit(0);
    }

    await import('@/main');
    if (values.open) openBrowser(hubUrl());
  },
});
