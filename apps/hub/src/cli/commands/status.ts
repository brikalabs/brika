import { rm } from 'node:fs/promises';
import pc from 'picocolors';
import type { Command } from '../command';
import { isErrnoException, PID_FILE, readPid } from '../utils/pid';

export default {
  name: 'status',
  description: 'Show whether the hub is running',
  examples: ['brika status'],
  async handler() {
    const pid = await readPid();
    if (pid === null) {
      console.log(`brika  ${pc.yellow('stopped')}`);
      return;
    }
    try {
      process.kill(pid, 0);
      console.log(`brika  ${pc.green('running')}  ${pc.dim('PID ' + pid)}`);
    } catch (e) {
      if (isErrnoException(e) && e.code === 'ESRCH') {
        console.log(`brika  ${pc.yellow('stopped')}  ${pc.dim('stale PID ' + pid)}`);
        await rm(PID_FILE, { force: true });
      } else {
        // EPERM: process exists but belongs to another user — still running
        console.log(`brika  ${pc.green('running')}  ${pc.dim('PID ' + pid)}`);
      }
    }
  },
} satisfies Command;
