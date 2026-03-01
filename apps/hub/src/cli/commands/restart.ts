import pc from 'picocolors';
import { defineCommand } from '../command';
import { CliError } from '../errors';
import { checkPid, removePidFile } from '../utils/pid';

export default defineCommand({
  name: 'restart',
  description: 'Restart the running hub',
  details: 'Signals the Brika supervisor to restart the hub process in the current directory.',
  examples: [
    'brika restart',
  ],
  async handler() {
    const status = await checkPid();
    if (status.state === 'stopped') {
      throw new CliError(`${pc.red('Not running')} — no hub running in this directory`);
    }
    if (status.state === 'stale') {
      console.error(
        `${pc.yellow('Not running')} — stale PID file (process ${status.pid} not found)`
      );
      await removePidFile();
      return;
    }
    process.kill(status.pid, 'SIGUSR1');
    console.log(
      `${pc.green('Restarting')} — sent restart signal to PID ${pc.dim(String(status.pid))}`
    );
  },
});
