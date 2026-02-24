import { defineCommand } from '../command';
import { detect } from '../utils/runtime';
import { runSupervisor, startBackground } from '../utils/supervisor';

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
    if (values.port) process.env.BRIKA_PORT = values.port;
    if (values.host) process.env.BRIKA_HOST = values.host;
    process.env.BRIKA_STATIC_DIR ??= uiDir;

    if (process.env.BRIKA_SUPERVISOR_PID) {
      await import('@/main');
      return;
    }

    if (!values.foreground) startBackground(values.open);
    await runSupervisor(values.open);
  },
});
