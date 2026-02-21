import { rm } from 'node:fs/promises';
import pc from 'picocolors';
import type { Command } from '../command';
import { isErrnoException, PID_FILE, readPid } from '../utils/pid';

export default {
  name: 'stop',
  description: 'Stop a running hub',
  details: 'Sends SIGTERM to the running Brika hub process in the current directory.',
  examples: ['brika stop'],
  async handler() {
    const pid = await readPid();
    if (pid === null) {
      console.error(`${pc.red('Not running')} — no PID file found in this directory`);
      process.exit(1);
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`${pc.green('Stopped')} — sent SIGTERM to PID ${pc.dim(String(pid))}`);
    } catch (e) {
      if (isErrnoException(e) && e.code === 'ESRCH') {
        console.error(`${pc.yellow('Not running')} — stale PID file (process ${pid} not found)`);
        await rm(PID_FILE, { force: true });
      } else {
        throw e;
      }
    }
  },
} satisfies Command;
