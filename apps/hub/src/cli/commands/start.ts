import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Command } from '../command';

const installDir = dirname(process.execPath);

function detect(relativePath: string): string {
  const fullPath = join(installDir, relativePath);
  return existsSync(fullPath) ? fullPath : '';
}

const bunBinary = detect(process.platform === 'win32' ? 'bun.exe' : 'bun') || 'bun';
const uiDir = detect('ui');

export default {
  name: 'start',
  description: 'Start the Brika hub',
  details: 'Starts the Brika hub server. If already running, will error.',
  options: {
    port: { type: 'string', short: 'p', description: 'Listen port (default: 3001)' },
    host: { type: 'string', description: 'Listen address (default: 127.0.0.1)' },
    foreground: { type: 'boolean', description: 'Keep attached to terminal (default: detach)' },
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

    process.env.BRIKA_BUN_PATH ??= bunBinary;
    process.env.BRIKA_STATIC_DIR ??= uiDir;

    await import('@/main');
  },
} satisfies Command;
