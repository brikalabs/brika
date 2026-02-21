import pc from 'picocolors';
import type { Command } from '../command';
import { detect, spawnDetached } from '../utils/runtime';

const uiDir = detect('ui');

function detach(): never {
  const { pid } = spawnDetached(['start', '--foreground']);

  console.log(`${pc.green('Started')} — hub running in background  ${pc.dim('PID ' + pid)}`);
  console.log(pc.dim(`  Stop with: brika stop`));
  process.exit(0);
}

export default {
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
  },
  examples: [
    'brika start',
    'brika start -p 8080',
    'brika start --host 0.0.0.0 -p 3000',
    'brika start --foreground',
  ],
  async handler({ values }) {
    if (typeof values.port === 'string') process.env.BRIKA_PORT = values.port;
    if (typeof values.host === 'string') process.env.BRIKA_HOST = values.host;
    process.env.BRIKA_STATIC_DIR ??= uiDir;

    if (values.foreground !== true) detach();

    await import('@/main');
  },
} satisfies Command;
